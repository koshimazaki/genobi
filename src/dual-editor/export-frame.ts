import { withBrowserActivity } from "../activity/store";
import { frameFilename } from "./frame-math";
import type { FrameSource } from "./frame-source";
import type { FrameSlot } from "./useFrameSlot";

export interface FrameAsset {
  id: string;
  blob: Blob;
  filename: string;
  source: string;
  frame: number;
  timestamp: number;
  width: number;
  height: number;
  slot: "A" | "B";
}

async function captureFrameImpl(
  slot: FrameSlot,
  label: "A" | "B",
): Promise<FrameAsset> {
  if (!slot.ready || !slot.shown || !slot.source)
    throw new Error("Wait for the selected frame to finish decoding.");
  // Snapshot these before the async encode: changing selection cannot relabel it.
  const { canvas, index } = slot.shown,
    source = slot.source;
  return captureDecodedFrame(source, index, canvas, label);
}

/** Shared exact-frame exporter for the dual editor and Director agent tools. */
async function captureDecodedFrameImpl(
  source: FrameSource,
  index: number,
  canvas: HTMLCanvasElement,
  label: "A" | "B",
): Promise<FrameAsset> {
  if (!source.frames[index]) throw new Error("Frame is outside this clip.");
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("PNG encoding failed.")),
      "image/png",
    ),
  );
  return {
    id: crypto.randomUUID(),
    blob,
    filename: frameFilename(source.name, index),
    source: source.name,
    frame: index,
    timestamp: source.frames[index].timestamp,
    width: canvas.width,
    height: canvas.height,
    slot: label,
  };
}

type SaveHandle = {
  createWritable(): Promise<{
    write(blob: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
};
type SaveWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SaveHandle>;
};

export function choosePngDestination(
  filename: string,
): Promise<SaveHandle> | null {
  const picker = (window as SaveWindow).showSaveFilePicker;
  return picker
    ? picker.call(window, {
        suggestedName: filename,
        types: [
          { description: "PNG image", accept: { "image/png": [".png"] } },
        ],
      })
    : null;
}

export async function saveBlob(
  blob: Blob,
  filename: string,
  destination?: Promise<SaveHandle> | null,
) {
  if (destination) {
    const handle = await destination,
      writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export const captureFrame = (...args: Parameters<typeof captureFrameImpl>) =>
  withBrowserActivity("dual-swords", () => captureFrameImpl(...args));

export const captureDecodedFrame = (
  ...args: Parameters<typeof captureDecodedFrameImpl>
) => withBrowserActivity("dual-swords", () => captureDecodedFrameImpl(...args));
