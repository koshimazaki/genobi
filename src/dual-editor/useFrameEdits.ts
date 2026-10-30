import { useEffect, useMemo, useRef, useState } from "react";
import { adjustedFrame, neutral, type Adjustments } from "./frame-adjustments";
import type { FrameSlot } from "./useFrameSlot";

export function useFrameEdits(slot: FrameSlot) {
  const [settings, setSettings] = useState<Adjustments>({ ...neutral });
  const [original, showOriginal] = useState(false);
  const [cutout, setCutout] = useState<{
    source: FrameSlot["source"];
    index: number;
    mask: HTMLCanvasElement;
  } | null>(null);
  const [background, setBackground] = useState<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null),
    operation = useRef(0);
  const source = slot.source,
    shown = slot.shown;
  useEffect(() => {
    operation.current++;
    worker.current?.terminate();
    worker.current = null;
    setSettings({ ...neutral });
    setCutout(null);
    setBackground(null);
    setBusy(false);
    setStatus("");
    showOriginal(false);
  }, [source]);
  useEffect(() => {
    operation.current++;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setStatus("");
  }, [shown?.index]);
  useEffect(
    () => () => {
      operation.current++;
      worker.current?.terminate();
    },
    [],
  );
  const mask =
    cutout?.source === source && cutout?.index === shown?.index
      ? cutout.mask
      : undefined;
  const canvas = useMemo(
    () =>
      shown
        ? original
          ? shown.canvas
          : adjustedFrame(shown.canvas, settings, mask, background)
        : null,
    [shown, original, settings, mask, background],
  );
  function cancel() {
    operation.current++;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setStatus("Background removal cancelled.");
  }
  function removeBackground() {
    if (!slot.ready || !shown || busy) return;
    const current = ++operation.current,
      index = shown.index;
    setBusy(true);
    setStatus("Preparing local background removal…");
    const small = document.createElement("canvas");
    small.width = small.height = 512;
    const ctx = small.getContext("2d")!;
    ctx.drawImage(shown.canvas, 0, 0, 512, 512);
    const pixels = ctx.getImageData(0, 0, 512, 512).data;
    const runner =
      worker.current ??
      new Worker(new URL("./background.worker.ts", import.meta.url), {
        type: "module",
      });
    worker.current = runner;
    runner.onmessage = (
      event: MessageEvent<{
        status?: string;
        error?: string;
        alpha?: Uint8ClampedArray<ArrayBuffer>;
      }>,
    ) => {
      if (current !== operation.current) return;
      if (event.data.status) setStatus(event.data.status);
      if (event.data.error) {
        setStatus(`Background removal unavailable: ${event.data.error}`);
        setBusy(false);
        runner.terminate();
        worker.current = null;
      }
      if (event.data.alpha) {
        ctx.putImageData(new ImageData(event.data.alpha, 512, 512), 0, 0);
        setCutout({ source, index, mask: small });
        showOriginal(false);
        setStatus("Foreground ready · inspect fine edges before exporting.");
        setBusy(false);
        // Release the large model session after inference; the download stays cached.
        runner.terminate();
        worker.current = null;
      }
    };
    runner.onerror = () => {
      if (current === operation.current) {
        setStatus(
          "Background removal failed in this browser. Your original frame is preserved.",
        );
        setBusy(false);
      }
      runner.terminate();
      worker.current = null;
    };
    runner.postMessage(pixels, [pixels.buffer]);
  }
  return {
    slot: {
      ...slot,
      shown: shown && canvas ? { ...shown, canvas } : shown,
      ready: slot.ready && !busy,
    },
    settings,
    setSettings,
    original,
    showOriginal,
    hasMask: !!mask,
    background,
    setBackground,
    busy,
    status,
    removeBackground,
    cancel,
    reset: () => {
      cancel();
      setSettings({ ...neutral });
      setCutout(null);
      setBackground(null);
      showOriginal(false);
      setStatus("");
    },
  };
}
export type FrameEdits = ReturnType<typeof useFrameEdits>;
