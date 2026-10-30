// The structural, timing and claim checks a teaser run's cut must pass
// (scripts/verify-teaser-run.mjs). Every finding carries a plain-English fix,
// written for a weak model that cannot read the code. Dependencies (the
// registry, the validators, the file system) are passed in so tests can run
// it on a fixture.
import {
  checkMix,
  mixFrames,
  type MixMedia,
  type MixSpec,
} from "../../../shared/templates/mix";
import { checkClaims } from "./claims";
import { currentRecipes, isV1, v1Media } from "./legacy";

export type Level = "fail" | "warn" | "info";
export interface Finding {
  level: Level;
  code: string;
  where: string;
  message: string;
  fix: string;
}

/** The analysed track, as docs/genobi-teaser-run/track-analysis.json holds it. */
export interface TrackAnalysis {
  bpm: number;
  periodSeconds: number;
  firstDownbeatSeconds: number;
  durationSeconds: number;
  /** Cut beats where a shot (or a card) must start: drops and section changes. */
  requiredCuts: number[];
}

export interface Deps {
  media: Record<string, MixMedia & { url?: string }>;
  /** Module id to a validator: true, or the first schema error as text. */
  validate: (module: string, parameters: unknown) => true | string;
  modules: Set<string>;
  /** The layer kind a recipe needs: "filter" or "graphics". */
  kindOf: (module: string) => "filter" | "graphics";
  layerLimit: number;
  /** Does `/media/...` exist under public/? */
  exists: (publicPath: string) => boolean;
  approvedText: Iterable<string>;
}

export interface CheckOptions {
  analysis: TrackAnalysis;
  /** Seconds a shot start may sit off the analysed beat grid. */
  toleranceSeconds?: number;
  allowNewWording?: boolean;
}

/**
 * Layers the Director builds from a cut (mixProject): one per shot and a
 * second for each shot with a camera move (the push-in, then the hold), one
 * per overlay, and the track.
 */
export const directorLayers = (cut: MixSpec) =>
  cut.shots.length +
  cut.shots.filter((s) => s.move).length +
  cut.layers.length +
  1;

/** Lanes and flags whose layers fill the frame and hide what is under them. */
const COVER_LANES = new Set(["cards", "reveal", "end"]);
const covers = (l: MixSpec["layers"][number]) =>
  l.kind === "graphics" &&
  l.opacity === 1 &&
  (l.card === true || COVER_LANES.has(l.lane));

/**
 * When a text layer's words are readable, in seconds from its start: from
 * when they are fully typed (a focus box types its label from draw × 0.5
 * for 0.4 s, teaser-focus.mjs) until the layer ends, its fadeAt, or a
 * full-frame layer drawn above it (later in the list) starts, whichever is
 * first.
 */
export function readableWindow(cut: MixSpec, index: number) {
  const layer = cut.layers[index];
  const p = layer.parameters;
  const from =
    layer.module === "ui-focus" && typeof p.draw === "number"
      ? p.draw * 0.5 + 0.4
      : 0;
  let to = sec(cut, layer.beats);
  if (typeof p.fadeAt === "number" && p.fadeAt > 0) to = Math.min(to, p.fadeAt);
  let coveredBy: string | null = null;
  for (const above of cut.layers.slice(index + 1)) {
    if (!covers(above)) continue;
    const start = above.startBeat;
    const end = above.startBeat + above.beats;
    if (end <= layer.startBeat || start > layer.startBeat + layer.beats)
      continue;
    const at = Math.max(0, sec(cut, start - layer.startBeat));
    if (at <= to) {
      to = at;
      coveredBy = above.id;
    }
  }
  return { from, to, coveredBy };
}

/** The shortest readable hold for an interface shot or a line of text. */
export const READABLE_SECONDS = 1.3;
/**
 * Recipes held to no minimum: a slam puts one or two words on the beat, and a
 * picture reveal's step words tick by while the picture builds.
 */
const SLAMS = new Set(["kinetic", "gen-image"]);
const MAX_SECONDS = 120;
const CARD_LANES = new Set(["cards", "end"]);
/**
 * Lanes bottom to top (docs/genobi-teaser.md, "Layer order"): the pointer and
 * box sit under the camera move so they zoom with the interface. A lane not
 * listed here (a later version's own) is left out of the check.
 */
export const LANE_ORDER = [
  "end",
  "cards",
  "cursor",
  "focus",
  "zoom",
  "reveal",
  "status",
  "callout",
  "impact",
  "hud",
  "wipe",
  "glitch",
];

const MIX_FIXES: [RegExp, string][] = [
  [
    /leaves a gap or overlaps/,
    "Set this shot's startBeat to the previous shot's startBeat + beats. Shots tile the cut with no gap and no overlap.",
  ],
  [/off the beat/, "Use a whole-number startBeat and beats greater than 0."],
  [
    /needs a video/,
    "Use an asset id from the media list in docs/genobi-teaser-run/README.md (ui-*, character, product, audio-visual, mix-01…03, library-01, library-03, dimensions, signal).",
  ],
  [
    /runs past its source/,
    "Lower sourceSeconds or beats: sourceSeconds + beats × 60 / bpm must stay inside the clip's length (the media table lists each length).",
  ],
  [/zooms outside 1 to 4/, "Set zoom between 1 and 4, or leave it out."],
  [
    /frames outside its source/,
    "cropY is the top of a 16:9 window on a 1440 px square: keep it between 0 and 630, or null for a 16:9 clip.",
  ],
  [
    /nothing holds the frame before the first shot/,
    "Cover beats 0 to the first shot with opaque graphics on lane cards (the title, then the gen-image reveal).",
  ],
  [
    /do not fill the cut/,
    "The last shot must end where the end card starts, and the end card must run to the cut's last beat.",
  ],
  [
    /bad or repeated layer id/,
    "Layer ids are lower-case letters, digits and hyphens, unique in the cut (zoom-44, cursor-44, focus-44…).",
  ],
  [/runs outside the cut/, "startBeat + beats must not pass the cut's beats."],
  [
    /lane .* overlaps/,
    "Two layers on one lane overlap: end the first before the next starts, or move one to its own lane.",
  ],
  [/track/, 'Keep track {"asset": "teaser-track", "seconds": 119.59}.'],
];

const SHAPE: [string, string][] = [
  ["id", "string"],
  ["bpm", "number"],
  ["inPointSeconds", "number"],
  ["fps", "number"],
  ["width", "number"],
  ["height", "number"],
  ["beats", "number"],
  ["track", "object"],
  ["shots", "array"],
  ["layers", "array"],
];
const typeOf = (v: unknown) =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
const sec = (cut: Pick<MixSpec, "bpm">, beats: number) =>
  (beats * 60) / cut.bpm;
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** Missing or mistyped fields, before anything reads them. */
export function checkShape(cut: unknown): Finding[] {
  const out: Finding[] = [];
  const fail = (where: string, message: string, fix: string) =>
    out.push({ level: "fail", code: "shape", where, message, fix });
  if (typeOf(cut) !== "object") {
    fail("cut", "The file is not a JSON object.", "Write one MixSpec object.");
    return out;
  }
  const c = cut as Record<string, unknown>;
  for (const [key, type] of SHAPE)
    if (typeOf(c[key]) !== type)
      fail(
        key,
        `"${key}" must be a ${type}.`,
        "Copy the field from examples/.",
      );
  if (out.length) return out;
  for (const key of ["asset", "seconds"])
    if (
      typeOf((c.track as Record<string, unknown>)[key]) !==
      (key === "asset" ? "string" : "number")
    )
      fail(
        `track.${key}`,
        `track.${key} is missing or the wrong type.`,
        'Keep track {"asset": "teaser-track", "seconds": 119.59}.',
      );
  if (out.length) return out;
  (c.shots as unknown[]).forEach((s, i) => {
    if (typeOf(s) !== "object")
      return fail(`shots[${i}]`, "A shot must be an object.", "See examples/.");
    const shot = s as Record<string, unknown>;
    for (const [key, type] of [
      ["asset", "string"],
      ["label", "string"],
      ["sourceSeconds", "number"],
      ["startBeat", "number"],
      ["beats", "number"],
    ])
      if (typeOf(shot?.[key]) !== type)
        fail(`shots[${i}]`, `"${key}" must be a ${type}.`, "See examples/.");
    if (!("cropY" in (shot ?? {})))
      fail(`shots[${i}]`, '"cropY" is missing.', "Write null for a 16:9 clip.");
  });
  (c.layers as unknown[]).forEach((l, i) => {
    if (typeOf(l) !== "object")
      return fail(
        `layers[${i}]`,
        "A layer must be an object.",
        "See examples/.",
      );
    const layer = l as Record<string, unknown>;
    for (const [key, type] of [
      ["id", "string"],
      ["name", "string"],
      ["module", "string"],
      ["kind", "string"],
      ["lane", "string"],
      ["startBeat", "number"],
      ["beats", "number"],
      ["opacity", "number"],
      ["parameters", "object"],
    ])
      if (typeOf(layer?.[key]) !== type)
        fail(`layers[${i}]`, `"${key}" must be a ${type}.`, "See examples/.");
  });
  return out;
}

/** Every check on one cut. Shape failures stop the rest. */
export function checkCut(
  raw: unknown,
  deps: Deps,
  options: CheckOptions,
): Finding[] {
  const shape = checkShape(raw);
  if (shape.length) return shape;
  const cut = currentRecipes(raw as MixSpec);
  const media = isV1(cut) ? v1Media : deps.media;
  const out: Finding[] = [];
  const add = (
    level: Level,
    code: string,
    where: string,
    message: string,
    fix: string,
  ) => out.push({ level, code, where, message, fix });

  // The Director's own mix rules (shared/templates/mix.ts).
  try {
    checkMix(cut, media as Record<string, MixMedia>);
  } catch (error) {
    const message = (error as Error).message;
    const fix = MIX_FIXES.find(([re]) => re.test(message))?.[1];
    add("fail", "mix", "cut", message, fix ?? "Compare with examples/.");
  }

  const count = directorLayers(cut);
  if (count > deps.layerLimit)
    add(
      "fail",
      "layer-cap",
      "cut",
      `${count} layers (shots, a second layer for each shot with a camera move, overlays and the track); the Director holds ${deps.layerLimit}.`,
      "Remove overlays first (a glitch, or a pointer that only holds still), never a shot on a drop.",
    );
  const seconds = mixFrames(cut) / cut.fps;
  if (seconds > MAX_SECONDS)
    add(
      "fail",
      "duration",
      "cut",
      `${round(seconds, 2)} s; the renderer stops at ${MAX_SECONDS} s.`,
      "Keep beats at 269 or fewer at 135 BPM.",
    );

  let highest = -1;
  for (const layer of cut.layers) {
    const rank = LANE_ORDER.indexOf(layer.lane);
    if (rank < 0) continue;
    if (rank < highest) {
      add(
        "fail",
        "layer-order",
        layer.id,
        `Lane "${layer.lane}" comes after lane "${LANE_ORDER[highest]}" in the layers list.`,
        `Write layers grouped by lane in this order: ${LANE_ORDER.join(", ")}.`,
      );
      break;
    }
    highest = rank;
  }
  for (const layer of cut.layers) {
    if (!deps.modules.has(layer.module)) {
      add(
        "fail",
        "recipe",
        layer.id,
        `"${layer.module}" is not a registered recipe.`,
        "Use one of the recipes in the README's recipe table.",
      );
      continue;
    }
    const kind = deps.kindOf(layer.module);
    if (layer.kind !== kind)
      add(
        "fail",
        "kind",
        layer.id,
        `${layer.module} is a ${kind} recipe, but the layer says kind "${layer.kind}".`,
        `Set "kind": "${kind}". ui-zoom and slice-glitch are filters; every other teaser recipe is graphics. A wrong kind stops the Director loading the cut.`,
      );
    const valid = deps.validate(layer.module, layer.parameters);
    if (valid !== true)
      add(
        "fail",
        "parameters",
        layer.id,
        `${layer.module} parameters: ${valid}`,
        "Every parameter is required; copy the full parameter set from an example layer of the same recipe and change only the values.",
      );
    if (SLAMS.has(layer.module) && layer.startBeat % 2 !== 0)
      add(
        "fail",
        "slam-off-bar",
        layer.id,
        `The slam starts on beat ${layer.startBeat}.`,
        "Section titles (kinetic) start on an even beat; use the break before a drop.",
      );
    const still = layer.parameters.still;
    if (typeof still === "string" && !deps.exists(still))
      add(
        "fail",
        "asset-missing",
        layer.id,
        `${still} does not exist under public/.`,
        "Use a still that ships: /media/director-templates/genobi-teaser/still-*.jpg.",
      );
  }

  for (const [i, shot] of cut.shots.entries()) {
    const m = (media as Deps["media"])[shot.asset];
    if (m?.url && !deps.exists(m.url))
      add(
        "fail",
        "asset-missing",
        `shot ${i + 1}`,
        `${m.url} does not exist under public/.`,
        "Run from a checkout with the bundled media (git lfs is not used; check out main).",
      );
    if (shot.asset.startsWith("ui-") && sec(cut, shot.beats) < READABLE_SECONDS)
      add(
        "fail",
        "readable-hold",
        `shot ${i + 1} (${shot.label})`,
        `An interface shot of ${round(sec(cut, shot.beats), 2)} s.`,
        `Hold every interface shot at least ${READABLE_SECONDS} s: 3 beats or more at 135 BPM (owner correction).`,
      );
  }
  for (const [index, layer] of cut.layers.entries()) {
    if (SLAMS.has(layer.module)) continue;
    const p = layer.parameters;
    if (
      !["label", "text", "line", "done"].some((k) => typeof p[k] === "string")
    )
      continue;
    const { from, to, coveredBy } = readableWindow(cut, index);
    const shown = Math.max(0, to - from);
    if (shown < READABLE_SECONDS)
      add(
        "fail",
        "readable-hold",
        layer.id,
        `Its words are readable for ${round(shown, 2)} s: fully typed at ${round(from, 2)} s, gone at ${round(to, 2)} s${coveredBy ? ` (covered by ${coveredBy})` : ""}.`,
        `Words stay fully typed and uncovered at least ${READABLE_SECONDS} s (owner correction): give the layer more beats, a later fadeAt, a shorter draw, or start the layer that covers it later.`,
      );
  }

  out.push(...checkTiming(cut, options));
  for (const c of checkClaims(cut, deps.approvedText, options.allowNewWording))
    add(c.level, "claim", c.layerId, c.message, c.fix);
  return out;
}

/** The cut's tempo and every shot start against the analysed beat grid. */
export function checkTiming(cut: MixSpec, options: CheckOptions): Finding[] {
  const { analysis } = options;
  const tolerance = options.toleranceSeconds ?? 0.05;
  const out: Finding[] = [];
  if (Math.abs(cut.bpm - analysis.bpm) > 0.1)
    out.push({
      level: "fail",
      code: "tempo",
      where: "bpm",
      message: `bpm ${cut.bpm}; the track measures ${round(analysis.bpm, 2)}.`,
      fix: `Set bpm to ${Math.round(analysis.bpm)} (the analysed tempo, rounded).`,
    });
  const grid = (t: number) => {
    const k = Math.round(
      (t - analysis.firstDownbeatSeconds) / analysis.periodSeconds,
    );
    return analysis.firstDownbeatSeconds + k * analysis.periodSeconds;
  };
  const starts = new Set<number>();
  for (const shot of cut.shots) {
    starts.add(shot.startBeat);
    const t = sec(cut, shot.startBeat);
    const off = Math.abs(t - grid(t));
    if (off > tolerance)
      out.push({
        level: "fail",
        code: "off-grid",
        where: `shot at beat ${shot.startBeat}`,
        message: `Cut at ${round(t)} s, ${Math.round(off * 1000)} ms off the beat grid.`,
        fix: "Check bpm (135) and that inPointSeconds is -0.037; shot starts are whole beats.",
      });
  }
  const last = cut.shots.at(-1);
  if (last) starts.add(last.startBeat + last.beats);
  // A full-frame card (the title, a reveal, a shader or credit beat, the end
  // card) counts as a cut where it starts, and holds any beat it covers.
  const cards = cut.layers.filter(
    (l) => (l.card || CARD_LANES.has(l.lane)) && l.opacity === 1,
  );
  for (const card of cards) starts.add(card.startBeat);
  const held = (beat: number) =>
    cards.some((c) => c.startBeat < beat && beat < c.startBeat + c.beats);
  for (const beat of analysis.requiredCuts)
    if (!starts.has(beat) && !held(beat))
      out.push({
        level: "fail",
        code: "missing-cut",
        where: `beat ${beat}`,
        message: `Nothing cuts on beat ${beat} (${round(sec(cut, beat), 2)} s), a drop or section change in the track.`,
        fix: "End a shot and start the next on this beat (decision table, docs/genobi-teaser-run/decision-table.md).",
      });
  return out;
}

/** Totals for the report's header. */
export function summary(cut: MixSpec) {
  const seconds = mixFrames(cut) / cut.fps;
  return {
    beats: cut.beats,
    seconds: round(seconds, 2),
    shots: cut.shots.length,
    overlays: cut.layers.length,
    layers: directorLayers(cut),
  };
}
