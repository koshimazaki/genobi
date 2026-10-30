import { laneId } from "./tracks";
import {
  MEDIA_DURATION_EPSILON_SECONDS,
  type Layer,
  type Project,
} from "./types";

/** The composition rates the Editor offers; the schema accepts 1–120. */
export const COMPOSITION_FPS = [24, 25, 30, 48, 60] as const;

/** A frame at `from` fps as the nearest whole frame at `to` fps. */
export const rescaleFrame = (frame: number, from: number, to: number) =>
  Math.round((frame * to) / from);

/**
 * The project at a new composition rate, chosen explicitly: every frame field
 * keeps its moment in seconds, rounded to whole frames, and every clip stays
 * at least one frame long. Rounding can make short neighbours collide, so each
 * track is then walked in time order and a clip that would start inside the
 * one before it starts at that clip's end instead (a frame or so later).
 * A video or audio clip never asks its file for a frame past the end: its
 * length is capped to the source, and when its in-point no longer leaves one
 * whole frame the in-point moves back to the source's last frame. The change
 * is refused, naming the clip, when the media is shorter than one frame at the
 * new rate or a track no longer fits in the composition. Nothing here runs on
 * import; a project keeps its rate until the person changes it.
 */
export function retimeProject(project: Project, fps: number): Project {
  const from = project.composition.fps;
  if (!Number.isInteger(fps) || fps < 1 || fps > 120)
    throw new Error("Choose a frame rate from 1 to 120");
  if (fps === from) return project;
  const at = (frame: number) => rescaleFrame(frame, from, fps);
  const durationFrames = Math.max(1, at(project.composition.durationFrames));
  /** Whole frames of a clip's source file at the new rate, or Infinity. */
  const frames = (l: Layer) =>
    "assetId" in l && "sourceStartFrame" in l
      ? Math.floor(
          ((project.assets[l.assetId]?.durationSeconds ?? 0) +
            MEDIA_DURATION_EPSILON_SECONDS) *
            fps,
        )
      : Infinity;
  const layers = project.layers.map((l): Layer => {
    const next = { ...l, startFrame: at(l.startFrame) } as Layer;
    next.durationFrames = Math.max(
      1,
      at(l.startFrame + l.durationFrames) - next.startFrame,
    );
    if ("sourceStartFrame" in next && "sourceStartFrame" in l) {
      const total = frames(l);
      if (total < 1)
        throw new Error(
          `At ${fps} fps, ${l.name}'s source is shorter than one frame. Remove it or choose a higher rate.`,
        );
      next.sourceStartFrame = Math.min(at(l.sourceStartFrame), total - 1);
    }
    if (l.animationOffsetFrames !== undefined)
      next.animationOffsetFrames = at(l.animationOffsetFrames);
    return next;
  });
  // Walk each track in time order: no clip starts inside the one before it.
  const tracks = new Map<string, Layer[]>();
  for (const l of layers) {
    const key = laneId(l);
    tracks.set(key, [...(tracks.get(key) ?? []), l]);
  }
  for (const clips of tracks.values()) {
    let previous = 0;
    for (const l of [...clips].sort((a, b) => a.startFrame - b.startFrame)) {
      l.startFrame = Math.max(l.startFrame, previous);
      if ("sourceStartFrame" in l)
        l.durationFrames = Math.min(
          l.durationFrames,
          frames(l) - l.sourceStartFrame,
        );
      if (l.startFrame + l.durationFrames > durationFrames)
        throw new Error(
          `At ${fps} fps, ${l.name} no longer fits before the composition ends: its track's short clips need more frames. Lengthen the composition or trim them first.`,
        );
      previous = l.startFrame + l.durationFrames;
    }
  }
  return {
    ...project,
    revision: project.revision + 1,
    composition: { ...project.composition, fps, durationFrames },
    layers,
    ...(project.notes && {
      notes: project.notes.map((n) => ({
        ...n,
        frame: Math.min(durationFrames - 1, at(n.frame)),
      })),
    }),
  };
}
