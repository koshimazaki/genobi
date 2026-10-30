export interface FramePoint {
  timestamp: number;
  duration: number;
}

/** Presentation order, never decode order or a guessed constant frame rate. */
export function frameIndex(points: FramePoint[]): FramePoint[] {
  if (!points.length) throw new Error("No video frames found.");
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];
    if (
      !Number.isFinite(point.timestamp) ||
      !Number.isFinite(point.duration) ||
      point.duration < 0
    )
      throw new Error("This video has invalid frame timing.");
    if (
      i &&
      Math.round(point.timestamp * 1e6) <=
        Math.round(sorted[i - 1].timestamp * 1e6)
    )
      throw new Error(
        "This video has ambiguous frame timestamps; exact selection is unavailable.",
      );
  }
  return sorted;
}

export function clampFrame(frame: number, count: number): number {
  return Math.max(
    0,
    Math.min(count - 1, Math.round(Number.isFinite(frame) ? frame : 0)),
  );
}

export function rulerWindow(
  frame: number,
  count: number,
  span: number,
): [number, number] {
  const width = Math.min(count - 1, Math.max(1, span));
  const start = Math.max(
    0,
    Math.min(count - 1 - width, frame - Math.floor(width / 2)),
  );
  return [start, start + width];
}

export function timeLabel(seconds: number): string {
  const ms = Math.round(Math.abs(seconds) * 1000);
  return `${seconds < 0 ? "−" : ""}${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

export function frameFilename(name: string, index: number): string {
  const base =
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .slice(0, 100) || "video";
  return `${base}_frame-${String(index).padStart(6, "0")}.png`;
}

export function pixelLevels(data: Uint8ClampedArray) {
  const histogram = Array<number>(64).fill(0);
  let luma = 0,
    red = 0,
    green = 0,
    blue = 0,
    black = 0,
    white = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    histogram[Math.min(63, Math.floor(y / 4))]++;
    luma += y;
    red += data[i];
    green += data[i + 1];
    blue += data[i + 2];
    if (y <= 1) black++;
    if (y >= 254) white++;
  }
  const percent = (sum: number) => (pixels ? (sum / pixels / 255) * 100 : 0);
  return {
    histogram,
    luma: percent(luma),
    rgb: [percent(red), percent(green), percent(blue)],
    black: pixels ? (black / pixels) * 100 : 0,
    white: pixels ? (white / pixels) * 100 : 0,
  };
}
