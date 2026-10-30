import {
  boundary,
  clipDuration,
  type EditClip,
  type Lane,
  type TimingSource,
} from "./timeline-model";
export type ClipDrag = "move" | "in" | "out";
function nearestBoundary(source: TimingSource, time: number) {
  let low = 0,
    high = source.frames.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (boundary(source, mid) < time) low = mid + 1;
    else high = mid;
  }
  return low > 0 &&
    Math.abs(boundary(source, low - 1) - time) <
      Math.abs(boundary(source, low) - time)
    ? low - 1
    : low;
}
/** Pointer movement changes the same frame-bounded cut list used by export. */
export function dragClip(
  clip: EditClip,
  source: TimingSource,
  kind: ClipDrag,
  seconds: number,
  lane: Lane = clip.lane,
): EditClip {
  if (kind === "move")
    return {
      ...clip,
      lane,
      start: Math.max(
        0,
        Math.min(
          120 - clipDuration(clip, source),
          Math.round((clip.start + seconds) * 30) / 30,
        ),
      ),
    };
  if (kind === "in") {
    let frame = Math.min(
      clip.out - 1,
      Math.max(0, nearestBoundary(source, boundary(source, clip.in) + seconds)),
    );
    while (
      frame < clip.out - 1 &&
      clip.start + boundary(source, frame) - boundary(source, clip.in) < -1e-8
    )
      frame++;
    return {
      ...clip,
      in: frame,
      start: Math.max(
        0,
        clip.start + boundary(source, frame) - boundary(source, clip.in),
      ),
    };
  }
  const out = Math.max(
    clip.in + 1,
    Math.min(
      source.frames.length,
      nearestBoundary(source, boundary(source, clip.out) + seconds),
    ),
  );
  return { ...clip, out };
}
