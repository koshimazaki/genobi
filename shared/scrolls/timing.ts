import { gridFrame, FRAME_GRID } from "../director/beat-grid";
import { timedCells } from "./commands";
import { parseScroll, type ScrollDocument } from "./types";
export type TimingMode = "move" | "left" | "right";
export type ScrollSnap = "frame" | "beat";
export const scrollGrid = (d: ScrollDocument) => ({
  step: (d.timing.fps * 60) / d.timing.bpm,
  origin: (d.timing.beatOffsetSeconds ?? 0) * d.timing.fps,
  beatsPerBar: 4,
});
export const scrollDuration = (d: ScrollDocument) =>
  Math.max(...timedCells(d).map((c) => c.startFrame + c.durationFrames));
/** All three visual lanes read one cell interval. Collision resolution pushes
 * following groups right; it never desynchronizes their annotations. */
export function retimeCell(
  d: ScrollDocument,
  id: string,
  mode: TimingMode,
  raw: number,
  snap: ScrollSnap,
): ScrollDocument {
  if (!Number.isFinite(raw)) throw new Error("Choose a frame.");
  const cells = timedCells(d),
    target = cells.find((c) => c.id === id);
  if (!target) throw new Error("Cell not found.");
  const frame = Math.max(
    0,
    gridFrame(raw, snap === "beat" ? scrollGrid(d) : FRAME_GRID),
  );
  const end = target.startFrame + target.durationFrames;
  if (mode === "move") target.startFrame = frame;
  else if (mode === "left") {
    target.startFrame = Math.min(end - 1, frame);
    target.durationFrames = end - target.startFrame;
  } else target.durationFrames = Math.max(1, frame - target.startFrame);
  // Keep earlier non-overlapping groups; insert the moved/trimmed group and push conflicts.
  const others = cells
    .filter((c) => c.id !== id)
    .sort((a, b) => a.startFrame - b.startFrame);
  let cursor = target.startFrame + target.durationFrames;
  for (const c of others) {
    if (c.startFrame + c.durationFrames <= target.startFrame) continue;
    c.startFrame = Math.max(cursor, c.startFrame);
    cursor = c.startFrame + c.durationFrames;
  }
  return parseScroll({ ...d, revision: d.revision + 1, cells });
}
export function audioInterval(d: ScrollDocument) {
  const a = d.assets.find((a) => a.id === d.timing.audioId),
    startFrame = d.timing.audioStartFrame ?? 0,
    sourceStartFrame = d.timing.sourceStartFrame ?? 0;
  if (!a) return undefined;
  const durationFrames = Math.min(
    scrollDuration(d) - startFrame,
    Math.floor(a.durationSeconds! * d.timing.fps) - sourceStartFrame,
  );
  return durationFrames > 0
    ? { startFrame, sourceStartFrame, durationFrames }
    : undefined;
}
/** A video frame maps to the decoded audio buffer only with its measured rate. */
export function sourceSample(
  frame: number,
  d: ScrollDocument,
  sampleRate: number | undefined,
) {
  if (!sampleRate || !Number.isFinite(sampleRate) || sampleRate <= 0)
    return undefined;
  const audio = audioInterval(d);
  if (
    !audio ||
    frame < audio.startFrame ||
    frame >= audio.startFrame + audio.durationFrames
  )
    return undefined;
  return Math.round(
    ((audio.sourceStartFrame + frame - audio.startFrame) * sampleRate) /
      d.timing.fps,
  );
}
