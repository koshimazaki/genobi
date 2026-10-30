import type { GenModBox } from "./recipe";

/**
 * Automatic targeting without a paid call: the box around the main subject of
 * an alpha matte, such as the one Dual Editor's on-device BiRefNet worker
 * returns (512 × 512 RGBA, alpha in the fourth channel). The matte is a square
 * resize of the frame, so a box on the 0–1000 grid maps back to the frame on
 * each axis. SAM3 text prompts are the upgrade for a named part ("his left
 * arm") and for following it across frames; see docs/genmod.md.
 */
export interface SubjectBoxOptions {
  /** Matte width and height in pixels. */
  size?: number;
  /** Bytes per pixel, and which one holds the alpha. */
  stride?: number;
  channel?: number;
  /** Alpha at or above this counts as subject. */
  threshold?: number;
  /** Grid units added on every side, so hair, a hat or a held prop has room. */
  margin?: number;
  /** Below this share of the frame, report no subject rather than a speck. */
  minShare?: number;
}

export function subjectBox(
  matte: ArrayLike<number>,
  {
    size = 512,
    stride = 4,
    channel = 3,
    threshold = 128,
    margin = 30,
    minShare = 0.002,
  }: SubjectBoxOptions = {},
): GenModBox | null {
  if (matte.length < size * size * stride)
    throw new Error("The matte is smaller than its size says");
  let top = size,
    left = size,
    bottom = -1,
    right = -1,
    count = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (matte[(y * size + x) * stride + channel] < threshold) continue;
      count++;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  if (count < minShare * size * size) return null;
  const grid = (v: number) => Math.round((v / size) * 1000);
  const clamp = (v: number) => Math.min(1000, Math.max(0, v));
  return [
    clamp(grid(top) - margin),
    clamp(grid(left) - margin),
    clamp(grid(bottom + 1) + margin),
    clamp(grid(right + 1) + margin),
  ];
}

/** A box an agent proposes from the frame PNG, before the person approves it. */
export interface ProposedBox {
  label: string;
  /** [x1, y1, x2, y2], as vision and grounding models write boxes. */
  xyxy: [number, number, number, number];
}

/**
 * An agent's box on FLUX's grid. `space` is the frame size in pixels for
 * models that answer in pixels, or "1000" for models that answer on a 0–1000
 * grid (Qwen3-VL's grounding output). Corners may come in either order;
 * the result is clamped to the frame, and a box under ten grid units on a
 * side (the Edit canvas's own minimum) is refused.
 */
export function boxFromAgent(
  xyxy: ProposedBox["xyxy"],
  space: { width: number; height: number } | "1000",
): GenModBox {
  if (xyxy.length !== 4 || xyxy.some((n) => !Number.isFinite(n)))
    throw new Error("A box is four numbers: x1, y1, x2, y2");
  const [w, h] = space === "1000" ? [1000, 1000] : [space.width, space.height];
  if (!(w > 0 && h > 0)) throw new Error("Frame size must be positive");
  const grid = (v: number, size: number) =>
    Math.round(Math.min(1000, Math.max(0, (v / size) * 1000)));
  const [x1, x2] = [grid(xyxy[0], w), grid(xyxy[2], w)].sort((a, b) => a - b);
  const [y1, y2] = [grid(xyxy[1], h), grid(xyxy[3], h)].sort((a, b) => a - b);
  if (x2 - x1 < 10 || y2 - y1 < 10)
    throw new Error("That box is too small to edit");
  return [y1, x1, y2, x2];
}
