import {
  sameExportSource,
  type ExportRequest,
  type ExportSource,
  type ExportStatus,
} from "../../shared/browser-export";

export interface BrowserExportAdapter {
  source(): ExportSource | undefined;
  execute(
    request: ExportRequest,
    progress: (value: number) => void,
    controller: AbortController,
  ): Promise<Blob>;
  status?(status: ExportStatus): void;
}
/** A tab polls while work runs, so cancellation does not wait for the encoder. */
export function startExportBridge(
  adapter: BrowserExportAdapter,
  fetcher: typeof fetch = fetch,
) {
  let stopped = false,
    tab: { id: string; source: ExportSource } | undefined;
  let active: { id: string; controller: AbortController } | undefined;
  const finished = new Set<string>();
  let lastStatus = "";
  function notify(job: ExportStatus) {
    const value = JSON.stringify(job);
    if (value !== lastStatus) {
      lastStatus = value;
      adapter.status?.(job);
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function request<T>(
    path: string,
    body?: unknown,
    method = "POST",
  ): Promise<T> {
    const response = await fetcher(`/api/exports${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
          }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        data.error ?? "Local browser export connection unavailable.",
      );
    return data as T;
  }
  function disconnect() {
    active?.controller.abort();
    const old = tab;
    tab = undefined;
    if (old)
      void fetcher(`/api/exports/tabs/${old.id}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
  }
  async function work(job: ExportStatus) {
    const controller = new AbortController();
    active = { id: job.id, controller };
    let lastProgress = 0;
    try {
      const blob = await adapter.execute(
        job.request,
        (progress) => {
          if (Date.now() - lastProgress < 2000) return;
          lastProgress = Date.now();
          void request(`/${job.id}/progress`, {
            state: "running",
            progress,
          }).catch(() => {});
        },
        controller,
      );
      controller.signal.throwIfAborted();
      const source = adapter.source();
      if (!source || !sameExportSource(source, job.request.source))
        throw new Error("The source changed before the artifact was uploaded.");
      const response = await fetcher(`/api/exports/${job.id}/artifact`, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.error ??
            "Artifact upload was not confirmed. Read export status before another request.",
        );
      notify(result as ExportStatus);
    } catch (error) {
      const state = controller.signal.aborted ? "cancelled" : "error";
      const errorText =
        error instanceof Error ? error.message : "Export failed";
      // A storing/done result wins over this update if upload acknowledgement
      // was lost. Never blindly render or upload the request again.
      try {
        notify(
          await request<ExportStatus>(
            `/${job.id}/progress`,
            state === "cancelled"
              ? { state }
              : { state, error: errorText.slice(0, 300) },
          ),
        );
      } catch {
        /* Status remains readable by the requesting agent; disconnect expires unfinished work. */
      }
    } finally {
      finished.add(job.id);
      if (finished.size > 256) finished.delete(finished.values().next().value!);
      if (active?.id === job.id) active = undefined;
    }
  }
  async function poll() {
    try {
      const source = adapter.source();
      if (!source) {
        disconnect();
        return;
      }
      if (tab && tab.source.id !== source.id) disconnect();
      if (!tab) {
        const connected = await request<{ tabId: string }>("/tabs", source);
        if (!/^[a-f0-9-]{36}$/.test(connected.tabId))
          throw new Error("Use the local Genobi server for browser export.");
        tab = { id: connected.tabId, source };
        if (stopped) {
          disconnect();
          return;
        }
      }
      const { job } = await request<{ job: ExportStatus | null }>(
        `/tabs/${tab.id}/poll`,
        source,
      );
      if (stopped) return;
      if (
        active &&
        (!job ||
          job.id !== active.id ||
          !["running", "queued", "storing"].includes(job.state))
      )
        active.controller.abort();
      if (job) {
        notify(job);
        if (
          ["queued", "running"].includes(job.state) &&
          !active &&
          !finished.has(job.id)
        )
          void work(job);
      }
    } catch {
      disconnect();
    } finally {
      if (!stopped) timer = setTimeout(() => void poll(), 2000);
    }
  }
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    disconnect();
  };
}
