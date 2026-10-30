import { useEffect, useRef, useState } from "react";
import type { PlayblastReceipt } from "../../shared/camera-path-playblast";
import type { PlayblastJob } from "./playblast";

export type PlayblastState =
  | { phase: "idle" }
  | { phase: "rendering"; done: number; total: number }
  | { phase: "saved"; name: string; video: string; path: string }
  | { phase: "error"; message: string };

/**
 * Render, save to the Director, and keep download links for the last clip
 * and its camera path. One render at a time; a new one or unmount revokes
 * the previous links.
 */
export function usePlayblast() {
  const [state, setState] = useState<PlayblastState>({ phase: "idle" });
  const abort = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const revoke = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
  };
  useEffect(
    () => () => {
      abort.current?.abort();
      revoke();
    },
    [],
  );
  async function run(
    make: (
      signal: AbortSignal,
      onFrame: (done: number) => void,
    ) => Omit<PlayblastJob, "signal" | "onFrame">,
    fileName: string,
    layerName: string,
  ) {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    revoke();
    let job: Omit<PlayblastJob, "signal" | "onFrame"> | null = null;
    try {
      let total = 0;
      const onFrame = (done: number) =>
        setState({ phase: "rendering", done, total });
      job = make(controller.signal, onFrame);
      const receipt: PlayblastReceipt = job.receipt;
      total = receipt.frames;
      onFrame(0);
      const { renderAndSave } = await import("./save-playblast");
      const blob = await renderAndSave(
        { ...job, signal: controller.signal, onFrame },
        fileName,
        layerName,
      );
      const path = new Blob([JSON.stringify(receipt.cameraPath, null, 2)], {
        type: "application/json",
      });
      urls.current = [URL.createObjectURL(blob), URL.createObjectURL(path)];
      setState({
        phase: "saved",
        name: layerName,
        video: urls.current[0],
        path: urls.current[1],
      });
    } catch (error) {
      setState(
        controller.signal.aborted
          ? { phase: "idle" }
          : {
              phase: "error",
              message:
                error instanceof Error ? error.message : "The render failed.",
            },
      );
    } finally {
      job?.capture.dispose();
      abort.current = null;
    }
  }
  return { state, run, cancel: () => abort.current?.abort() };
}
