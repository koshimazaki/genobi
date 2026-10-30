import type { Layer } from "../../shared/director/types";
import type { Lane } from "../../shared/director/tracks";

/** The channel-name column's range; the divider and arrow keys clamp to it. */
export const CHANNEL_WIDTH = { min: 32, max: 320, folded: 40 } as const;

/** Full labels, then short names below 180 px, then coloured dots below 72. */
export type Density = "full" | "short" | "dots";
export const density = (width: number): Density =>
  width < 72 ? "dots" : width < 180 ? "short" : "full";

export const SHORT_NAMES: Record<Layer["kind"] | View, string> = {
  audio: "Audio",
  video: "Video",
  image: "Image",
  graphics: "Anime",
  filter: "FX",
  camera: "Cam",
  action: "Action",
  rhythm: "Rhythm",
  markers: "Marks",
};

/**
 * Views drawn from the project rather than layers of their own. Camera and
 * subject action project the storyboard shots' directions; rhythm draws the
 * beat grid's bars; markers draw frame notes and beats. Removing a view hides
 * it and deletes nothing.
 */
export const VIEWS = ["camera", "action", "markers", "rhythm"] as const;
export type View = (typeof VIEWS)[number];
export const VIEW_NAMES: Record<View, string> = {
  camera: "Camera",
  action: "Action",
  markers: "Markers / beats",
  rhythm: "Rhythm",
};
export const viewKey = (v: View) => `view:${v}`;

/**
 * The storyboard lane the Camera and Action views follow: the picture lane
 * (video or image) holding the most clips, the lowest in the stack on a tie,
 * so a template's shot track wins over a single overlay plate.
 */
export function storyboardLane(stack: Lane[]) {
  let best: Lane | undefined;
  for (const lane of stack)
    if (
      lane.family === "visual" &&
      (!best || lane.layers.length > best.layers.length)
    )
      best = lane;
  return best;
}

/**
 * Rows in presentation order: the person's order for the rows it names,
 * every other row at its default place. Presentation never changes the
 * compositing stack; Raise/Lower in stack is the separate, explicit edit.
 */
export function arrange(defaults: string[], stored: string[]) {
  const known = new Set(defaults);
  const result = stored.filter((k) => known.has(k));
  defaults.forEach((key, i) => {
    if (result.includes(key)) return;
    // After the last-placed row that precedes it by default, else first.
    const after = Math.max(
      -1,
      ...defaults.slice(0, i).map((k) => result.indexOf(k)),
    );
    result.splice(after + 1, 0, key);
  });
  return result;
}
