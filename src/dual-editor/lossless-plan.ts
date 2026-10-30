import {
  boundary,
  programSegments,
  validateEdit,
  type EditClip,
  type TimingSource,
} from "./timeline-model";

export const COPY_EPSILON = 0.000002;
export const COPY_HELP =
  "Choose Native exact cuts to re-encode, or move the cut to a safe keyframe boundary. No lossy fallback was used.";
export function copyError(reason: string): never {
  throw new Error(`Lossless copy: ${reason} ${COPY_HELP}`);
}
/** Collapse cosmetic split boundaries, respecting the actual upper-track program. */
export function losslessSegments(
  clips: EditClip[],
  timing: Map<string, TimingSource>,
) {
  validateEdit(clips, timing);
  const result: {
    source: string;
    start: number;
    end: number;
    at: number;
    muted: boolean;
  }[] = [];
  for (const segment of programSegments(clips, timing)) {
    const clip = segment.clip;
    if (!clip)
      copyError("black gaps require rendering. Use Join clips to close them.");
    const start =
      boundary(timing.get(clip.source)!, clip.in) + segment.start - clip.start;
    const end = start + segment.end - segment.start;
    const previous = result.at(-1);
    if (
      previous &&
      previous.source === clip.source &&
      previous.muted === clip.muted &&
      Math.abs(previous.end - start) < COPY_EPSILON
    )
      previous.end = end;
    else
      result.push({
        source: clip.source,
        start,
        end,
        at: segment.start,
        muted: clip.muted,
      });
  }
  return result;
}
/** Stable decoder identity includes codec, dimensions, colour metadata and codec-private bytes. */
export function decoderIdentity(value: unknown): string {
  if (value instanceof ArrayBuffer)
    return JSON.stringify([...new Uint8Array(value)]);
  if (ArrayBuffer.isView(value))
    return JSON.stringify([
      ...new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    ]);
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${decoderIdentity(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
