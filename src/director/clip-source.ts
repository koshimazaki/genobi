import {
  MEDIA_DURATION_EPSILON_SECONDS,
  type Asset,
  type Layer,
  type Project,
} from "../../shared/director/types";

/**
 * Where a timeline clip sits in its source file, in composition frames. The
 * in-point is the first source frame the clip shows and the out-point the
 * last, the same frames the renderer draws (`sourceStartFrame / fps`) and the
 * trim preview labels.
 */
export interface SourceRange {
  inFrame: number;
  outFrame: number;
  inSeconds: number;
  outSeconds: number;
  /** Whole source frames at the composition rate, when the duration is known. */
  sourceFrames?: number;
  /** Unused source frames before the in-point and after the out-point. */
  head: number;
  tail?: number;
}

export function sourceRange(
  layer: Layer,
  asset: Asset | undefined,
  fps: number,
): SourceRange | undefined {
  if (!("sourceStartFrame" in layer)) return undefined;
  const inFrame = layer.sourceStartFrame,
    outFrame = inFrame + layer.durationFrames - 1;
  const sourceFrames =
    asset?.durationSeconds !== undefined
      ? Math.floor(
          (asset.durationSeconds + MEDIA_DURATION_EPSILON_SECONDS) * fps,
        )
      : undefined;
  return {
    inFrame,
    outFrame,
    inSeconds: inFrame / fps,
    outSeconds: outFrame / fps,
    sourceFrames,
    head: inFrame,
    tail:
      sourceFrames === undefined
        ? undefined
        : Math.max(0, sourceFrames - outFrame - 1),
  };
}

/** The clips that place an asset, in timeline order. */
export function clipsOf(project: Project, assetId: string) {
  return project.layers
    .filter((l) => "assetId" in l && l.assetId === assetId)
    .sort((a, b) => a.startFrame - b.startFrame);
}

/** The asset a layer shows, or "" for graphics, filters and unknown ids. */
export function linkedAsset(project: Project | undefined, layerId: string) {
  const layer = project?.layers.find((l) => l.id === layerId);
  return layer && "assetId" in layer ? layer.assetId : "";
}

/**
 * The clip an asset card describes: the selected clip when it uses the
 * asset, otherwise the asset's first clip on the timeline.
 */
export function linkedClip(
  project: Project,
  assetId: string,
  selectedLayerId: string,
) {
  const clips = clipsOf(project, assetId);
  return clips.find((l) => l.id === selectedLayerId) ?? clips[0];
}

/** Seconds into the source for a card's poster: its clip's in-point, or 0. */
export function posterSeconds(
  project: Project,
  assetId: string,
  selectedLayerId: string,
) {
  const clip = linkedClip(project, assetId, selectedLayerId);
  return clip && "sourceStartFrame" in clip
    ? clip.sourceStartFrame / project.composition.fps
    : 0;
}

/** "6.00 s" under a minute, "1:02.50" from a minute up. */
export function durationLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, "0")}`;
}

/** A card's one-line source span: "0.25–1.46 s". */
export const rangeLabel = (r: SourceRange) =>
  `${r.inSeconds.toFixed(2)}–${r.outSeconds.toFixed(2)} s`;

/** An inspector line: "f 6 · 0.250 s". */
export const pointLabel = (frame: number, fps: number) =>
  `f ${frame} · ${(frame / fps).toFixed(3)} s`;
