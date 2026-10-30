import { boundary, type EditClip, type TimingSource } from "./timeline-model";
import type { ClipDrag } from "./clip-drag";
export interface TrimPreview {
  clip: string;
  source: string;
  frame: number;
  edge: ClipDrag;
  lane: EditClip["lane"];
  time: number;
}
/** Out is exclusive: preview the last included frame, never the cut boundary. */
export function trimPreview(
  clip: EditClip,
  source: TimingSource,
  edge: ClipDrag,
): TrimPreview {
  const frame = edge === "out" ? clip.out - 1 : clip.in;
  return {
    clip: clip.id,
    source: clip.source,
    frame,
    edge,
    lane: clip.lane,
    time: clip.start + (boundary(source, frame) - boundary(source, clip.in)),
  };
}

export function retainsTrim(preview: TrimPreview, clips: EditClip[]) {
  return clips.some(
    (c) =>
      c.id === preview.clip &&
      c.source === preview.source &&
      preview.frame === (preview.edge === "out" ? c.out - 1 : c.in),
  );
}
