import type { FramePoint } from "./frame-math";

export type Lane = "A" | "B";
export interface EditClip {
  id: string;
  source: string;
  lane: Lane;
  start: number;
  /** Source frame boundaries: in inclusive, out exclusive. */
  in: number;
  out: number;
  muted: boolean;
}
export interface TimingSource {
  frames: FramePoint[];
}
export function boundary(source: TimingSource, frame: number): number {
  if (frame < source.frames.length) return source.frames[frame].timestamp;
  const last = source.frames.at(-1)!;
  const previous = source.frames.at(-2);
  return (
    last.timestamp +
    (last.duration || (previous ? last.timestamp - previous.timestamp : 1 / 30))
  );
}
export function clipDuration(clip: EditClip, source: TimingSource) {
  return boundary(source, clip.out) - boundary(source, clip.in);
}
export function duration(
  clips: EditClip[],
  sources: Map<string, TimingSource>,
) {
  return Math.max(
    0,
    ...clips.map((c) => c.start + clipDuration(c, sources.get(c.source)!)),
  );
}
export function activeClip(
  clips: EditClip[],
  sources: Map<string, TimingSource>,
  time: number,
) {
  // The upper A track supplies both picture and sound during an overlap.
  return [...clips]
    .reverse()
    .sort((a, b) => a.lane.localeCompare(b.lane))
    .find(
      (c) =>
        time >= c.start &&
        time < c.start + clipDuration(c, sources.get(c.source)!) - 1e-8,
    );
}
export function sourceFrame(source: TimingSource, timestamp: number) {
  let low = 0,
    high = source.frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (source.frames[mid].timestamp <= timestamp + 1e-8) low = mid;
    else high = mid - 1;
  }
  return low;
}
export function splitClip(
  clip: EditClip,
  source: TimingSource,
  time: number,
  id: string,
): EditClip[] {
  const frame = sourceFrame(
    source,
    boundary(source, clip.in) + time - clip.start,
  );
  if (frame <= clip.in || frame >= clip.out)
    throw new Error(
      "Place the playhead inside this clip, after its first frame.",
    );
  return [
    { ...clip, out: frame },
    {
      ...clip,
      id,
      in: frame,
      start: clip.start + boundary(source, frame) - boundary(source, clip.in),
    },
  ];
}
export function validateEdit(
  clips: EditClip[],
  sources: Map<string, TimingSource>,
) {
  if (!clips.length) throw new Error("Add a clip to the timeline first.");
  if (clips.length > 40)
    throw new Error("This utility supports up to 40 clip sections.");
  for (const c of clips) {
    const s = sources.get(c.source);
    if (
      !s ||
      !Number.isFinite(c.start) ||
      c.start < 0 ||
      !Number.isInteger(c.in) ||
      !Number.isInteger(c.out) ||
      c.in < 0 ||
      c.out > s.frames.length ||
      c.out <= c.in
    )
      throw new Error("A clip has invalid frame boundaries or timing.");
  }
  if (duration(clips, sources) > 120)
    throw new Error("Keep the teaser within two minutes.");
  for (const lane of ["A", "B"]) {
    const ordered = clips
      .filter((c) => c.lane === lane)
      .sort((a, b) => a.start - b.start);
    if (
      ordered.some(
        (c, i) =>
          i > 0 &&
          c.start <
            ordered[i - 1].start +
              clipDuration(
                ordered[i - 1],
                sources.get(ordered[i - 1].source)!,
              ) -
              1e-6,
      )
    )
      throw new Error(
        `Clips overlap on track ${lane}. Move the clip to the other track or after the previous clip.`,
      );
  }
}

/** Non-overlapping program regions, including gaps, for deterministic A/V cuts. */
export function programSegments(
  clips: EditClip[],
  sources: Map<string, TimingSource>,
) {
  const cuts = [
    ...new Set([
      0,
      ...clips.flatMap((c) => [
        c.start,
        c.start + clipDuration(c, sources.get(c.source)!),
      ]),
    ]),
  ].sort((a, b) => a - b);
  return cuts.slice(0, -1).map((start, i) => ({
    start,
    end: cuts[i + 1],
    clip: activeClip(clips, sources, (start + cuts[i + 1]) / 2),
  }));
}
