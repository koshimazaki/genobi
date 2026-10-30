// The short, human labels on feedback commands: what changed, in composition
// frames and, when the composition has a beat grid, in beats and bars as the
// timeline draws them (`beat-grid.ts`, offset included). Pure wording; the
// diff that decides what changed is `feedback-diff.ts`.
import { beatGrid, type BeatGrid } from "./beat-grid";
import { laneId } from "./tracks";
import type { Layer, Note, Project, Visual } from "./types";

export interface Timing {
  fps: number;
  /** Absent when the composition names no tempo: frames only. */
  grid?: BeatGrid;
}
export const timingOf = (c: Project["composition"]): Timing => ({
  fps: c.fps,
  ...(c.bpm === undefined ? {} : { grid: beatGrid(c) }),
});

const round = (n: number, places: number) => {
  const r = Number(n.toFixed(places));
  return Object.is(r, -0) ? 0 : r;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Text cut to a length, so a label stays one line. */
export const short = (text: string, max = 40) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const later = (n: number) => (n > 0 ? "later" : "earlier");

/** A length: "12 frames (0.82 beats)". */
export function span(frames: number, t: Timing) {
  const n = Math.abs(frames);
  const beats = t.grid ? ` (${round(n / t.grid.step, 2)} beats)` : "";
  return `${plural(n, "frame")}${beats}`;
}

/**
 * A position: "frame 249", and with a grid where it falls on the bars, from
 * the grid's offset: "frame 249 (on bar 4 beat 4)" or "(1.2 frames after …)".
 */
export function at(frame: number, t: Timing) {
  if (!t.grid) return `frame ${frame}`;
  const { step, origin, beatsPerBar } = t.grid;
  const k = Math.round((frame - origin) / step);
  const off = round(frame - (origin + k * step), 1);
  const bar = Math.floor(k / beatsPerBar) + 1;
  const beat = (((k % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1;
  const where = `bar ${bar} beat ${beat}`;
  const rel =
    off === 0
      ? `on ${where}`
      : `${plural(Math.abs(off), "frame")} ${off > 0 ? "after" : "before"} ${where}`;
  return `frame ${frame} (${rel})`;
}

/** How a person would name a layer: a title by its words, else its name. */
export function layerName(l: Layer) {
  const text =
    "parameters" in l && typeof l.parameters.text === "string"
      ? l.parameters.text.trim()
      : "";
  return text ? `title ${short(text)}` : short(l.name, 60);
}

/** A value in a label: numbers trimmed, text quoted and cut short. */
export function value(v: unknown): string {
  if (typeof v === "number") return String(round(v, 3));
  if (typeof v === "string") return `"${short(v)}"`;
  if (v === undefined) return "none";
  return short(JSON.stringify(v), 60);
}

const source = (l: Layer) =>
  "sourceStartFrame" in l
    ? l.sourceStartFrame
    : "moduleId" in l
      ? (l.animationOffsetFrames ?? 0)
      : 0;

/** A move, trim, in-point or track change, from the layer before and after. */
export function timingLabel(before: Layer, after: Layer, t: Timing) {
  const parts: string[] = [];
  const ds = after.startFrame - before.startFrame;
  const end = (l: Layer) => l.startFrame + l.durationFrames;
  const de = end(after) - end(before);
  if (ds)
    parts.push(
      `starts ${span(ds, t)} ${later(ds)}, at ${at(after.startFrame, t)}`,
    );
  if (after.durationFrames !== before.durationFrames)
    parts.push(
      `${de ? `ends ${span(de, t)} ${later(de)}, ` : ""}now ${span(after.durationFrames, t)} long`,
    );
  const dr = source(after) - source(before);
  if (dr)
    parts.push(
      "sourceStartFrame" in after
        ? `in-point ${plural(Math.abs(dr), "frame")} ${later(dr)} (source frame ${source(after)})`
        : `its animation ${plural(Math.abs(dr), "frame")} ${dr > 0 ? "further in" : "further back"}`,
    );
  if (laneId(after) !== laneId(before))
    parts.push(`onto track ${laneId(after)}`);
  return `${layerName(before)} ${parts.join(", ") || "keeps its timing"}`;
}

/** A placement change: "HUD moved down 40 px", "scale 1 → 1.25". */
export function placementLabel(name: string, before: Visual, after: Visual) {
  const parts: string[] = [];
  const dx = round(after.position.x - before.position.x, 3);
  const dy = round(after.position.y - before.position.y, 3);
  const moves = [
    dy ? `${dy > 0 ? "down" : "up"} ${Math.abs(dy)} px` : "",
    dx ? `${dx > 0 ? "right" : "left"} ${Math.abs(dx)} px` : "",
  ].filter(Boolean);
  if (moves.length) parts.push(`moved ${moves.join(" and ")}`);
  for (const [key, word, unit] of [
    ["scale", "scale", ""],
    ["opacity", "opacity", ""],
    ["rotationDegrees", "rotation", "°"],
  ] as const)
    if (before[key] !== after[key])
      parts.push(
        `${word} ${value(before[key])}${unit} → ${value(after[key])}${unit}`,
      );
  const m = after.motion;
  if (JSON.stringify(before.motion) !== JSON.stringify(m))
    parts.push(
      m
        ? `now moves to scale ${value(m.scaleTo)}, x ${value(m.xTo)}, y ${value(m.yTo)}, opacity ${value(m.opacityTo)} by its end`
        : "no longer moves",
    );
  return `${name} ${parts.join(", ")}`;
}

/** Recipe parameters: `text "A" → "B"`. */
export function parametersLabel(
  name: string,
  before: Record<string, unknown>,
  changed: Record<string, unknown>,
) {
  const parts = Object.entries(changed).map(
    ([k, v]) => `${k} ${value(before[k])} → ${value(v)}`,
  );
  return `${name} ${parts.join(", ")}`;
}

/** A new clip or recipe layer, where and how long. */
export function addedLabel(l: Layer, t: Timing) {
  const what =
    "assetId" in l
      ? `${l.kind} ${short(l.name, 60)} (asset ${l.assetId})`
      : `${layerName(l)} (recipe ${l.moduleId})`;
  const inPoint =
    "sourceStartFrame" in l && l.sourceStartFrame
      ? `, in-point source frame ${l.sourceStartFrame}`
      : "";
  return `added ${what} on track ${laneId(l)} at ${at(l.startFrame, t)}, ${span(l.durationFrames, t)} long${inPoint}`;
}

/** A note as the agent should read it: where, on what, and its words. */
export function noteLabel(n: Note, layers: Layer[], t: Timing) {
  const layer = layers.find((l) => l.id === n.layerId);
  return `note at ${at(n.frame, t)}${layer ? ` on ${layerName(layer)}` : ""}: "${short(n.text, 120)}"`;
}
