import { useEffect, useRef, useState } from "react";
import type {
  ExportReceipt,
  ExportSource,
  ExportStatus,
} from "../../shared/browser-export";
import { sameExportSource } from "../../shared/browser-export";
import {
  startExportBridge,
  type BrowserExportAdapter,
} from "../browser-exports/bridge";
import { studioStore } from "../studio/store";
import { archiveBundle } from "./bundle";
import { exportMp4 } from "./export";
import type { DirectorRenderer } from "./renderer";
import { copyAvailable } from "./project-copy";
import {
  renderReport,
  type RenderReport,
} from "../../shared/licensing/render-report";
import { readSelection, readUsage } from "../licensing/preferences";

interface ExportView {
  renderer: () => DirectorRenderer | null;
  ready: () => boolean;
  abort: { current: AbortController | null };
  status: (text: string) => void;
  frame: (value: number) => void;
  preview: (url: string) => void;
  summary: (report: RenderReport) => void;
}
export function directorExportAdapter(view: ExportView): BrowserExportAdapter {
  const source = (): ExportSource | undefined => {
    const bundle = studioStore.getState().director.bundle;
    if (!bundle || !view.ready()) return;
    return {
      kind: "director",
      id: bundle.project.id,
      revision: bundle.project.revision,
    };
  };
  return {
    source,
    async execute(request, progress, controller) {
      const state = studioStore.getState(),
        before = state.director.bundle,
        current = source();
      if (!before || !current || !sameExportSource(current, request.source))
        throw new Error(
          "The mounted project changed. Read the new source revision.",
        );
      if (Object.values(state.operations).some(Boolean))
        throw new Error("Wait for playback, import or export to finish.");
      const rendering = request.format === "mp4";
      const renderer = view.renderer();
      if (rendering && (!renderer || renderer.bundle !== before))
        throw new Error(
          "Wait for the current project preview to finish loading.",
        );
      state.actions.operations(
        rendering ? { rendering: true } : { workingFile: true },
      );
      view.abort.current = controller;
      view.status(
        rendering
          ? "Rendering requested MP4…"
          : "Checking requested project archive…",
      );
      const unsubscribe = studioStore.subscribe((now) => {
        if (now.director.bundle !== before) controller.abort();
      });
      try {
        controller.signal.throwIfAborted();
        const blob = rendering
          ? await exportMp4(
              renderer!,
              (frame) => {
                view.frame(frame);
                progress(
                  (frame + 1) / before.project.composition.durationFrames,
                );
              },
              controller.signal,
            )
          : new Blob([new Uint8Array(await archiveBundle(before))], {
              type: "application/zip",
            });
        controller.signal.throwIfAborted();
        if (rendering) {
          view.summary(
            renderReport(before.project, {
              selection: readSelection(),
              usage: readUsage(),
            }),
          );
          view.preview(URL.createObjectURL(blob));
        }
        view.status("Storing completed export…");
        return blob;
      } finally {
        unsubscribe();
        state.actions.operations(
          rendering ? { rendering: false } : { workingFile: false },
        );
        if (view.abort.current === controller) view.abort.current = null;
      }
    },
  };
}

export function useDirectorAgentExport(view: ExportView) {
  const latest = useRef(view);
  latest.current = view;
  const [receipt, setReceipt] = useState<ExportReceipt>();
  useEffect(() => {
    const adapter = directorExportAdapter({
      renderer: () => latest.current.renderer(),
      ready: () => latest.current.ready(),
      abort: view.abort,
      status: (text) => latest.current.status(text),
      frame: (value) => latest.current.frame(value),
      preview: (url) => latest.current.preview(url),
      summary: (report) => latest.current.summary(report),
    });
    const status = (job: ExportStatus) => {
      if (job.state === "done" && job.receipt) {
        setReceipt(job.receipt);
        latest.current.status("Requested export ready · download available");
      } else if (job.state === "error" || job.state === "cancelled")
        latest.current.status(job.error ?? "Requested export cancelled");
    };
    let stopped = false,
      disconnect: (() => void) | undefined;
    void copyAvailable().then((available) => {
      if (available && !stopped)
        disconnect = startExportBridge({ ...adapter, status });
    });
    return () => {
      stopped = true;
      disconnect?.();
    };
  }, [view.abort]);
  return receipt;
}
