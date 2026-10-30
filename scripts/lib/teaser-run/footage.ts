// Turns the capture log (docs/genobi-teaser-footage.json) and the track
// analysis into layer parameters, so a weak model computes overlays instead
// of guessing them (scripts/teaser-run-helper.mjs). The rules are the ones
// the v1 cut was written with; docs/genobi-teaser-run/README.md states them.

export interface Rect {
  x: number;
  y: number;
  w?: number;
  h?: number;
}
export interface LogEvent {
  t: number;
  kind: "move" | "click";
  label: string;
  rect: Rect;
}
export type Footage = Record<string, { seconds: number; log: LogEvent[] }>;

/** The pointer's glide into each target, in seconds (the capture's). */
export const GLIDE = 0.7;
/** A focus box fades this long before its layer ends. */
export const FOCUS_TAIL = 0.35;
export const POINTER_STYLE = {
  fill: "#f6f8f2",
  outline: "#0c0e0c",
  color: "#d5ff70",
  size: 1.25,
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const beatSeconds = (bpm: number) => 60 / bpm;
const centre = (r: Rect) => ({
  x: r.x + (r.w ?? 0) / 2,
  y: r.y + (r.h ?? 0) / 2,
});

function shotLog(footage: Footage, asset: string) {
  const shot = footage[asset];
  if (!shot)
    throw new Error(
      `No footage "${asset}". Use one of: ${Object.keys(footage).join(", ")}.`,
    );
  return shot.log;
}

/**
 * The ui-cursor parameters for a slice: the pointer starts where it last
 * was (or at the first target), holds, and glides 0.7 s into each target
 * the log moved to inside the slice; clicks are the log's clicks there.
 */
export function cursorFor(
  footage: Footage,
  asset: string,
  sourceSeconds: number,
  beats: number,
  bpm: number,
) {
  const log = shotLog(footage, asset);
  const end = beats * beatSeconds(bpm);
  const moves = log.filter((e) => e.kind === "move");
  const before = moves.filter((e) => e.t < sourceSeconds).at(-1);
  const inside = moves.filter(
    (e) => e.t >= sourceSeconds && e.t - sourceSeconds <= end,
  );
  const start = before ?? inside[0];
  if (!start) return null;
  const keys: { t: number; x: number; y: number }[] = [
    { t: 0, ...centre(start.rect) },
  ];
  for (const e of inside) {
    const at = e.t - sourceSeconds;
    const prev = keys.at(-1)!;
    if (at - GLIDE > prev.t) keys.push({ t: at - GLIDE, x: prev.x, y: prev.y });
    keys.push({ t: at, ...centre(e.rect) });
  }
  const clicks = log
    .filter(
      (e) =>
        e.kind === "click" &&
        e.t >= sourceSeconds &&
        e.t - sourceSeconds <= end,
    )
    .map((e) => r3(e.t - sourceSeconds));
  return {
    path: keys.map((k) => `${r3(k.t)}:${r3(k.x)},${r3(k.y)}`).join(" / "),
    clicks: clicks.join(" / "),
    ...POINTER_STYLE,
  };
}

/** The log event a label names (the last one, when the label repeats). */
export function eventFor(footage: Footage, asset: string, label: string) {
  const hits = shotLog(footage, asset).filter((e) => e.label === label);
  if (!hits.length)
    throw new Error(
      `"${label}" is not in ${asset}'s log. Labels: ${[
        ...new Set(shotLog(footage, asset).map((e) => e.label)),
      ].join(", ")}.`,
    );
  return hits.at(-1)!;
}

/**
 * The ui-focus parameters for a target: its box from the log (with `pad`
 * added on every side, 0 by default) and the label in capitals. A box of 5
 * beats or more draws in 0.3 s and fades FOCUS_TAIL before its end; a
 * shorter one draws in 0.1 s and holds to its end. Either way the label is
 * readable, fully typed (from draw × 0.5 for 0.4 s), at least 1.3 s.
 */
export function focusFor(
  footage: Footage,
  asset: string,
  label: string,
  text: string,
  beats: number,
  bpm: number,
  pad = 0,
) {
  const r = eventFor(footage, asset, label).rect;
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  const seconds = beats * beatSeconds(bpm);
  const long = beats >= 5;
  return {
    x: r3(x),
    y: r3(y),
    w: r3(Math.min(1 - x, (r.w ?? 0.02) + 2 * pad)),
    h: r3(Math.min(1 - y, (r.h ?? 0.03) + 2 * pad)),
    label: text.toUpperCase(),
    color: "#d5ff70",
    dim: 0.45,
    draw: long ? 0.3 : 0.1,
    fadeAt: r3(long ? seconds - FOCUS_TAIL : seconds),
  };
}

/**
 * The ui-zoom parameters: from the whole frame onto the target's centre. The
 * zoom, unless given: 2.2 onto a small control (under 0.05 wide), 1.8 onto a
 * panel, 1.35 onto a point with no box (a 3D scene).
 */
export function zoomFor(
  footage: Footage,
  asset: string,
  label: string,
  zoom?: number,
) {
  const r = eventFor(footage, asset, label).rect;
  const c = centre(r);
  zoom ??= r.w === undefined ? 1.35 : r.w < 0.05 ? 2.2 : 1.8;
  return {
    fromX: 0.5,
    fromY: 0.5,
    fromZoom: 1,
    x: r2(c.x),
    y: r2(c.y),
    zoom,
    ease: 1.1,
    drift: 0.02,
  };
}

export interface AnalysisReport {
  durationSeconds: number;
  grid: { bpm: number; periodSeconds: number } | null;
  downbeat: { firstDownbeatSeconds: number } | null;
  moments: { kind: string; startSeconds: number; changeDb: number }[];
}

/**
 * Drops as cut beats. The bundled track starts on the cut's frame 0, so a
 * cut beat is seconds × bpm / 60 on the rounded tempo. A drop counts when it
 * lands within 0.15 beat of a bar line (a multiple of 4); others are listed
 * as `offBar` and are not cut on.
 */
export function sectionsFrom(report: AnalysisReport) {
  if (!report.grid || !report.downbeat)
    throw new Error("The analysis found no beat grid (beatFound is false).");
  const bpm = Math.round(report.grid.bpm);
  const drops = report.moments
    .filter((m) => m.kind === "drop")
    .map((m) => {
      const beat = (m.startSeconds * bpm) / 60;
      const bar = Math.round(beat / 4) * 4;
      return {
        seconds: m.startSeconds,
        changeDb: m.changeDb,
        cutBeat: r2(beat),
        bar: Math.abs(beat - bar) <= 0.15 ? bar : null,
      };
    });
  return {
    bpm,
    beatSeconds: r3(60 / bpm),
    firstDownbeatSeconds: report.downbeat.firstDownbeatSeconds,
    firstDownbeatBeat: r2((report.downbeat.firstDownbeatSeconds * bpm) / 60),
    totalBeats: Math.floor((Math.min(report.durationSeconds, 120) * bpm) / 60),
    drops: drops.filter((d) => d.bar !== null).map((d) => ({ ...d })),
    offBar: drops.filter((d) => d.bar === null),
  };
}

/**
 * A studio slice from the capture log: it starts 0.45 s before the first
 * event it shows (at least 0.2 s in) and holds 1.3 s after the last, in whole
 * beats from 4 to 12, never past the footage's end.
 */
export function sliceFor(
  footage: Footage,
  asset: string,
  first: string,
  last: string,
  bpm: number,
) {
  const shot = footage[asset];
  const a = eventFor(footage, asset, first);
  const b = eventFor(footage, asset, last);
  const beat = beatSeconds(bpm);
  const sourceSeconds = Math.max(0.2, Math.round((a.t - 0.45) * 10) / 10);
  const fit = Math.floor((shot.seconds - sourceSeconds - 0.05) / beat);
  const want = Math.ceil((b.t - sourceSeconds + 1.3) / beat);
  return {
    asset,
    sourceSeconds,
    beats: Math.max(Math.min(4, fit), Math.min(12, want, fit)),
    shows: [first, last],
  };
}

/**
 * A studio shot's camera move (MixShot.move): from the whole frame onto the
 * target's centre at zoomFor's zoom, eased over 2 beats, drifting on 3% a
 * second. The pointer and box follow it through their `view` parameter.
 */
export function moveFor(
  footage: Footage,
  asset: string,
  label: string,
  zoom?: number,
) {
  const z = zoomFor(footage, asset, label, zoom);
  return { x: z.x, y: z.y, zoom: z.zoom, ease: 2, drift: 0.03 };
}
