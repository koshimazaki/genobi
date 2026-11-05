import type {
  LiveScrollRequest,
  LiveScrollStatus,
  ScrollSnapshot,
} from "../../shared/scrolls/live";
export interface ScrollLiveAdapter {
  snapshot(): ScrollSnapshot;
  execute(request: LiveScrollRequest): Promise<ScrollSnapshot>;
}
/** Only acknowledgement delivery repeats. A dispatched edit is never re-executed. */
export function startScrollLiveBridge(
  tabId: string,
  documentId: string,
  adapter: ScrollLiveAdapter,
  fetcher: typeof fetch = fetch,
) {
  let stopped = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const completed = new Map<
    string,
    { snapshot: ScrollSnapshot } | { error: string }
  >();
  async function post<T>(route: string, body: unknown): Promise<T> {
    const response = await fetcher(`/api/exports/scrolls${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "Live Scroll connection unavailable.");
    return data as T;
  }
  async function poll() {
    try {
      const snapshot = adapter.snapshot();
      if (snapshot.document.id !== documentId) return;
      const { job } = await post<{ job: LiveScrollStatus | null }>(
        `/tabs/${tabId}/poll`,
        snapshot,
      );
      if (stopped || !job || job.state !== "running") return;
      let result = completed.get(job.id);
      if (!result) {
        // History is bounded with the server's 256-command, one-hour ledger.
        // Never evict an uncertain result and accidentally replay its edit.
        if (completed.size >= 256)
          result = {
            error:
              "Reconnect this Scroll before more commands; the local acknowledgement history is full.",
          };
        else {
          try {
            result = { snapshot: await adapter.execute(job.request) };
          } catch (error) {
            result = {
              error: (error instanceof Error
                ? error.message
                : "Scroll edit failed."
              ).slice(0, 300),
            };
          }
          completed.set(job.id, result);
        }
      }
      await post(`/commands/${job.id}/result`, result);
    } catch {
      /* Poll again; retain completed results after a lost acknowledgement. */
    } finally {
      if (!stopped) timer = setTimeout(() => void poll(), 2000);
    }
  }
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
