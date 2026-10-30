import type { Project } from "../../shared/director/types";
import {
  beatGrid,
  FRAME_GRID,
  markerGrid,
  type SnapGrid,
} from "../../shared/director/beat-grid";
import { framePixels } from "../../shared/director/timeline";

export const SNAP_MODES = ["free", "frame", "beat", "marker"] as const;
export type SnapMode = (typeof SNAP_MODES)[number];

/**
 * The markers Snap: Marker lands on: the composition's start and end and
 * every frame note. Storage stays in whole frames whichever mode is chosen.
 */
export const markerFrames = (p: Project) => [
  0,
  p.composition.durationFrames,
  ...(p.notes ?? []).map((n) => n.frame),
];

/** The grid an edit snaps to. Free and Frame share whole frames. */
export function snapGrid(mode: string, p: Project): SnapGrid {
  if (mode === "beat") return beatGrid(p.composition);
  if (mode === "marker") return markerGrid(markerFrames(p));
  return FRAME_GRID;
}

/** Free drops edge magnetism, as Shift does in the other modes. */
export const magnetic = (mode: string) => mode !== "free";

/** The fewest pixels per frame Fit all uses, so a long piece stays visible. */
export const FIT_MIN_PIXELS = 0.2;
/** Manual zoom's range in pixels per frame; Fit all may go below it. */
export const ZOOM_PIXELS = { min: 2, max: 12 } as const;

/**
 * Pixels per frame. Fit all fills the lanes' width exactly (fractional, below
 * the manual minimum when the piece is long); otherwise the manual zoom's
 * whole pixels, which keep the frame grid on whole pixels.
 */
export function timelinePixels(
  fps: number,
  zoom: number,
  fit: { on: boolean; width: number; frames: number },
) {
  if (fit.on && fit.width > 0 && fit.frames > 0)
    return Math.max(FIT_MIN_PIXELS, fit.width / fit.frames);
  return Math.min(ZOOM_PIXELS.max, framePixels(fps, zoom));
}
