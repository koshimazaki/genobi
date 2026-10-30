import type { Project } from "./types";

/** The tempo the timeline assumes when a composition names none. */
export const DEFAULT_BPM = 120;
export const DEFAULT_BEATS_PER_BAR = 4;

/**
 * A snap grid in composition frames: lines at `origin + k × step` for every
 * integer k, before the origin as well as after it. Steps may be fractional
 * (a beat at 98.2 BPM and 24 fps is 14.66 frames); clips land on the nearest
 * whole frame.
 */
export interface SnapGrid {
  step: number;
  origin: number;
  /**
   * Marker snapping: the whole frames to snap to instead of the periodic
   * lines. Empty or absent means the periodic grid applies.
   */
  frames?: readonly number[];
}

/** Snap to the nearest of these frames (Snap: Marker). */
export const markerGrid = (frames: readonly number[]): SnapGrid => ({
  step: 1,
  origin: 0,
  frames: [...new Set(frames.map(Math.round))].sort((a, b) => a - b),
});

/** Whole-frame snapping, the grid when Snap is set to Frame. */
export const FRAME_GRID: SnapGrid = { step: 1, origin: 0 };

export interface BeatGrid extends SnapGrid {
  beatsPerBar: number;
}

/**
 * The composition's beat grid. `beatOffsetSeconds` is where a downbeat falls
 * on the composition, so the grid follows the song rather than frame 0;
 * bundles without it keep the grid they always had.
 */
export function beatGrid(c: Project["composition"]): BeatGrid {
  return {
    step: (c.fps * 60) / (c.bpm ?? DEFAULT_BPM),
    origin: (c.beatOffsetSeconds ?? 0) * c.fps,
    beatsPerBar: c.beatsPerBar ?? DEFAULT_BEATS_PER_BAR,
  };
}

/** A grid given as a bare step is the old absolute grid from frame 0. */
export const toGrid = (grid: SnapGrid | number): SnapGrid =>
  typeof grid === "number" ? { step: grid, origin: 0 } : grid;

/** The whole frame of grid line k. */
const line = (k: number, { step, origin }: SnapGrid) =>
  Math.round(origin + k * step);

/** The nearest grid line to a frame, as a whole frame. */
export function gridFrame(frame: number, grid: SnapGrid | number) {
  const g = toGrid(grid);
  if (g.frames?.length)
    return g.frames.reduce(
      (best, f) => (Math.abs(f - frame) < Math.abs(best - frame) ? f : best),
      g.frames[0],
    );
  return line(Math.round((frame - g.origin) / g.step), g);
}

/**
 * The first grid line strictly after (direction 1) or before (-1) a frame,
 * compared as whole frames, so a nudge always moves even when a fractional
 * line rounds onto the frame it starts from.
 */
export function nudgeFrame(
  frame: number,
  grid: SnapGrid | number,
  direction: 1 | -1,
) {
  const g = toGrid(grid);
  if (g.frames?.length) {
    const next =
      direction > 0
        ? g.frames.find((f) => f > frame)
        : [...g.frames].reverse().find((f) => f < frame);
    // Past the last marker, a nudge still moves one whole frame.
    return next ?? Math.round(frame) + direction;
  }
  let k = Math.round((frame - g.origin) / g.step);
  while (direction * (line(k, g) - frame) <= 0) k += direction;
  return line(k, g);
}

/** Every beat line from frame 0 to the end, with downbeats marked as bars. */
export function beatLines(durationFrames: number, grid: BeatGrid) {
  const lines: { frame: number; bar: boolean }[] = [];
  const first = Math.ceil((-0.5 - grid.origin) / grid.step);
  for (let k = first; ; k++) {
    const frame = line(k, grid);
    if (frame > durationFrames) break;
    if (frame < 0) continue;
    const beat = ((k % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar;
    lines.push({ frame, bar: beat === 0 });
  }
  return lines;
}

/**
 * The beat offset that puts a downbeat on a frame, in seconds rounded to the
 * millisecond: well inside one frame at any supported frame rate.
 */
export const downbeatAt = (frame: number, fps: number) =>
  Math.round((frame / fps) * 1000) / 1000;
