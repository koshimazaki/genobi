import { startScrollLiveBridge } from "./live-bridge";
import { scrollLiveAdapter } from "./live-agent";
import { useEffect, useRef, useState } from "react";
import {
  sameExportSource,
  type ExportReceipt,
  type ExportSource,
} from "../../shared/browser-export";
import {
  startExportBridge,
  type BrowserExportAdapter,
} from "../browser-exports/bridge";
import { copyAvailable } from "../director/project-copy";
import { scrollArchiveBytes, scrollJsonBytes } from "./archive";
import type { useScrolls } from "./useScrolls";

type ScrollState = ReturnType<typeof useScrolls>;
export function scrollExportAdapter(
  current: () => ScrollState,
): BrowserExportAdapter {
  const source = (): ExportSource => {
    const { document } = current().current();
    return { kind: "scrolls", id: document.id, revision: document.revision };
  };
  return {
    source,
    async execute(request, progress, controller) {
      const s = current(),
        before = s.current();
      if (!sameExportSource(source(), request.source))
        throw new Error(
          "The mounted Scroll changed. Read its current revision.",
        );
      let blob: Blob | undefined, error: unknown;
      const ran = await s.run(async () => {
        try {
          controller.signal.throwIfAborted();
          if (
            request.format !== "scroll-zip" &&
            request.format !== "scroll-json"
          )
            throw new Error("Choose a Scroll ZIP or JSON export.");
          const bytes =
            request.format === "scroll-zip"
              ? await scrollArchiveBytes(before)
              : scrollJsonBytes(before.document);
          controller.signal.throwIfAborted();
          if (s.current() !== before)
            throw new Error("The Scroll changed while packaging the export.");
          blob = new Blob([bytes], {
            type:
              request.format === "scroll-zip"
                ? "application/zip"
                : "application/json",
          });
          progress(1);
        } catch (caught) {
          error = caught;
          throw caught;
        }
      });
      if (!ran || !blob)
        throw (
          error ?? new Error("Wait for the current Scroll operation to finish.")
        );
      return blob;
    },
  };
}

export function useScrollAgentExport(s: ScrollState) {
  const latest = useRef(s);
  latest.current = s;
  const [enabled, setEnabled] = useState(true),
    [available, setAvailable] = useState(false);
  const [tabId, setTabId] = useState<string>(),
    [code, setCode] = useState<string>();
  const currentTab = useRef<string | undefined>(undefined);
  const [connectedSource, setConnectedSource] = useState<ExportSource>();
  const [receipt, setReceipt] = useState<ExportReceipt>();
  useEffect(() => {
    let live = true;
    void copyAvailable().then((value) => {
      if (live) setAvailable(value);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!available || !enabled) return;
    let stopLive: (() => void) | undefined;
    let liveTab: string | undefined;
    const stopExport = startExportBridge({
      ...scrollExportAdapter(() => latest.current),
      connection(id, source) {
        if (id !== liveTab) {
          stopLive?.();
          liveTab = id;
          stopLive =
            id && source
              ? startScrollLiveBridge(
                  id,
                  source.id,
                  scrollLiveAdapter(() => latest.current),
                )
              : undefined;
        }
        if (currentTab.current !== id) setCode(undefined);
        currentTab.current = id;
        setTabId(id);
        setConnectedSource(source);
      },
      status(job) {
        if (job.state === "done" && job.receipt) {
          setReceipt(job.receipt);
          latest.current.setMessage(
            "Requested Scroll export ready · download available",
          );
        } else if (job.state === "error" || job.state === "cancelled")
          latest.current.setMessage(
            job.error ?? "Requested Scroll export cancelled",
          );
      },
    });
    return () => {
      stopLive?.();
      stopExport();
    };
  }, [available, enabled, s.mountId]);
  async function link() {
    if (!tabId) return;
    try {
      const response = await fetch(`/api/exports/tabs/${tabId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          scrollExportAdapter(() => latest.current).source(),
        ),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not link this Scroll tab.");
      if (currentTab.current === tabId) setCode(result.code);
    } catch (error) {
      latest.current.setMessage(
        error instanceof Error
          ? error.message
          : "Could not link this Scroll tab.",
      );
    }
  }
  const source = scrollExportAdapter(() => latest.current).source()!;
  const matches = connectedSource && sameExportSource(source, connectedSource);
  return {
    available,
    enabled,
    setEnabled,
    tabId: matches ? tabId : undefined,
    code: connectedSource?.id === source.id ? code : undefined,
    link,
    receipt: receipt?.source.id === s.bundle.document.id ? receipt : undefined,
  };
}
