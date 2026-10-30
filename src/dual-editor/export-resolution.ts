import type { FramePoint } from "./frame-math";
export type MixedSizing = "native" | "fit";
export interface ResolutionSource {
  width: number;
  height: number;
  name: string;
  frames?: FramePoint[];
}
/** Shared canvas contains every source. Native mode pads; it never resizes pixels. */
export function exportResolution(
  clips: { source: string }[],
  sources: Map<string, ResolutionSource>,
  sizing: MixedSizing = "native",
) {
  const ids = [...new Set(clips.map((c) => c.source))];
  if (!ids.length) return null;
  const originals = ids.map((id) => ({ ...sources.get(id)!, id }));
  const width = Math.ceil(Math.max(...originals.map((s) => s.width)) / 2) * 2;
  const height = Math.ceil(Math.max(...originals.map((s) => s.height)) / 2) * 2;
  const used = originals.map((source) => {
    const fit =
      sizing === "native"
        ? 1
        : Math.min(width / source.width, height / source.height);
    return {
      ...source,
      fit,
      operation: fit === 1 ? "Native size" : "Scaled to fit",
      bars:
        Math.abs(width - source.width * fit) > 0.01 ||
        Math.abs(height - source.height * fit) > 0.01,
    };
  });
  const rates = originals.map((source) => {
    const frames = source.frames ?? [];
    const steps = frames
      .slice(1)
      .map((frame, i) => frame.timestamp - frames[i].timestamp)
      .filter((t) => t > 0)
      .sort((a, b) => a - b);
    return steps.length
      ? 1 / steps[Math.floor(steps.length / 2)]
      : 1 / (frames[0]?.duration || 1 / 30);
  });
  return {
    width,
    height,
    used,
    frameRate: Math.round(Math.max(...rates) * 1000) / 1000,
    mixed: originals.some(
      (s) => s.width !== originals[0].width || s.height !== originals[0].height,
    ),
  };
}

/** Integer placement in native mode prevents half-pixel interpolation on odd sizes. */
export function framePlacement(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  sizing: MixedSizing,
) {
  const fit =
    sizing === "native"
      ? 1
      : Math.min(width / sourceWidth, height / sourceHeight);
  const x = (width - sourceWidth * fit) / 2,
    y = (height - sourceHeight * fit) / 2;
  return {
    x: sizing === "native" ? Math.floor(x) : x,
    y: sizing === "native" ? Math.floor(y) : y,
    width: sourceWidth * fit,
    height: sourceHeight * fit,
  };
}
