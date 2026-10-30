// How close a run's cut is to a reference (the v1 cut, or run A for run B):
// sections present, cuts on the same beats, the same footage per section,
// overlay counts and wording. Read-only; the verifier prints it and fails
// only when --min-similarity is given and the score falls below it.
import type { MixLayer, MixShot, MixSpec } from "../../../shared/templates/mix";
import { normalise, onScreenText } from "./claims";

/** The teaser's sections in cut beats (the decision table's rows). */
export const SECTIONS: { id: string; from: number; to: number }[] = [
  { id: "open", from: 0, to: 12 },
  { id: "first-shot", from: 12, to: 20 },
  { id: "generations", from: 20, to: 36 },
  { id: "make", from: 36, to: 76 },
  { id: "direct", from: 76, to: 140 },
  { id: "build-remix", from: 140, to: 192 },
  { id: "agents", from: 192, to: 236 },
  { id: "final-drop", from: 236, to: 260 },
  { id: "end-card", from: 260, to: 269 },
];

const jaccard = <T>(a: Set<T>, b: Set<T>) => {
  if (!a.size && !b.size) return 1;
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both / (a.size + b.size - both);
};
const inSection = (s: { from: number; to: number }, beat: number) =>
  beat >= s.from && beat < s.to;
const round = (n: number) => Math.round(n * 1000) / 1000;
const boundaries = (cut: MixSpec) => {
  const set = new Set(cut.shots.map((s) => s.startBeat));
  const last = cut.shots.at(-1);
  if (last) set.add(last.startBeat + last.beats);
  return set;
};
const countBy = (layers: MixLayer[]) => {
  const counts: Record<string, number> = {};
  for (const l of layers) counts[l.module] = (counts[l.module] ?? 0) + 1;
  return counts;
};
/** A shot's identity: where it sits, what it shows and how it is framed. */
export const shotKey = (s: MixShot) => {
  const {
    asset,
    sourceSeconds,
    startBeat,
    beats,
    cropY,
    zoom,
    label,
    ...rest
  } = s as MixShot & Record<string, unknown>;
  void label;
  const frame = [
    cropY === null || cropY === undefined ? "" : ` cropY ${cropY}`,
    zoom === undefined ? "" : ` zoom ${zoom}`,
    ...Object.keys(rest)
      .sort()
      .map((k) => ` ${k} ${JSON.stringify(rest[k])}`),
  ].join("");
  return `${startBeat}+${beats} ${asset}@${sourceSeconds}${frame}`;
};

export interface SectionReport {
  id: string;
  present: boolean;
  footage: number;
  overlays: { run: number; reference: number };
}
export interface Similarity {
  score: number;
  parts: {
    cuts: number;
    footage: number;
    overlays: number;
    wording: number;
    exactShots: number;
  };
  sections: SectionReport[];
  overlayCounts: Record<string, { run: number; reference: number }>;
  differences: string[];
}

/** Compares `run` with `reference`; every part is 0 (nothing alike) to 1. */
export function compare(run: MixSpec, reference: MixSpec): Similarity {
  const refCuts = boundaries(reference);
  const runCuts = boundaries(run);
  let kept = 0;
  for (const b of refCuts) if (runCuts.has(b)) kept++;
  const cuts = refCuts.size ? kept / refCuts.size : 1;

  const sections = SECTIONS.map((s) => {
    const assets = (cut: MixSpec) =>
      new Set(
        cut.shots.filter((x) => inSection(s, x.startBeat)).map((x) => x.asset),
      );
    const overlays = (cut: MixSpec) =>
      cut.layers.filter((l) => inSection(s, l.startBeat)).length;
    const present =
      run.shots.some((x) => inSection(s, x.startBeat)) ||
      run.layers.some((l) => l.lane === "cards" && inSection(s, l.startBeat)) ||
      run.layers.some((l) => l.lane === "end" && inSection(s, l.startBeat));
    return {
      id: s.id,
      present,
      footage: round(jaccard(assets(run), assets(reference))),
      overlays: { run: overlays(run), reference: overlays(reference) },
    };
  });
  const footage =
    sections.reduce((sum, s) => sum + s.footage, 0) / sections.length;

  const a = countBy(run.layers);
  const b = countBy(reference.layers);
  const overlayCounts: Similarity["overlayCounts"] = {};
  let overlayScore = 0;
  const modules = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const m of modules) {
    const r = a[m] ?? 0;
    const f = b[m] ?? 0;
    overlayCounts[m] = { run: r, reference: f };
    overlayScore += Math.min(r, f) / Math.max(r, f, 1);
  }
  const overlays = modules.length ? overlayScore / modules.length : 1;

  const words = (cut: MixSpec) =>
    new Set(onScreenText(cut).map((t) => normalise(t.text)));
  const refWords = words(reference);
  const runWords = words(run);
  let said = 0;
  for (const w of refWords) if (runWords.has(w)) said++;
  const wording = refWords.size ? said / refWords.size : 1;

  const refShots = new Set(reference.shots.map(shotKey));
  const exact = run.shots.filter((s) => refShots.has(shotKey(s))).length;
  const exactShots = reference.shots.length
    ? exact / reference.shots.length
    : 1;

  return {
    score: round((cuts + footage + overlays + wording + exactShots) / 5),
    parts: {
      cuts: round(cuts),
      footage: round(footage),
      overlays: round(overlays),
      wording: round(wording),
      exactShots: round(exactShots),
    },
    sections,
    overlayCounts,
    differences: differences(run, reference),
  };
}

const layerKey = (l: MixLayer) =>
  JSON.stringify([
    l.module,
    l.lane,
    l.kind,
    l.startBeat,
    l.beats,
    l.parameters,
  ]);

/**
 * A copy, not a derivation: at least 90% of the reference's shots (framing
 * included) and 90% of its layers (values included) appear unchanged. Names
 * and ordering are ignored, so renaming layers does not hide a copy.
 */
export function copiedFrom(run: MixSpec, reference: MixSpec) {
  const shots = new Set(run.shots.map(shotKey));
  const layers = new Set(run.layers.map(layerKey));
  const sameShots = reference.shots.filter((s) => shots.has(shotKey(s))).length;
  const sameLayers = reference.layers.filter((l) =>
    layers.has(layerKey(l)),
  ).length;
  return (
    sameShots >= 0.9 * reference.shots.length &&
    sameLayers >= 0.9 * reference.layers.length
  );
}

/** Plain lines naming what differs, shots first, at most 40. */
export function differences(run: MixSpec, reference: MixSpec): string[] {
  const out: string[] = [];
  for (const key of ["bpm", "fps", "width", "height", "beats"] as const)
    if (run[key] !== reference[key])
      out.push(`${key}: ${reference[key]} → ${run[key]}`);
  const runShots = new Map(run.shots.map((s) => [s.startBeat, s]));
  const refShots = new Map(reference.shots.map((s) => [s.startBeat, s]));
  for (const [beat, s] of refShots) {
    const r = runShots.get(beat);
    if (!r) out.push(`shot at beat ${beat} (${s.label}): missing`);
    else if (shotKey(r) !== shotKey(s))
      out.push(`shot at beat ${beat}: ${shotKey(s)} → ${shotKey(r)}`);
  }
  for (const [beat, r] of runShots)
    if (!refShots.has(beat)) out.push(`shot at beat ${beat} (${r.label}): new`);
  const runLayers = new Map(run.layers.map((l) => [l.id, l]));
  const refLayers = new Map(reference.layers.map((l) => [l.id, l]));
  for (const [id, l] of refLayers) {
    const r = runLayers.get(id);
    if (!r) out.push(`layer ${id} (${l.module}): missing`);
    else if (r.kind !== l.kind || r.lane !== l.lane)
      out.push(`layer ${id}: ${l.kind} on ${l.lane} → ${r.kind} on ${r.lane}`);
    else if (r.startBeat !== l.startBeat || r.beats !== l.beats)
      out.push(
        `layer ${id}: beats ${l.startBeat}+${l.beats} → ${r.startBeat}+${r.beats}`,
      );
    else
      for (const [k, v] of Object.entries(l.parameters))
        if (JSON.stringify(r.parameters[k]) !== JSON.stringify(v))
          out.push(
            `layer ${id}.${k}: ${JSON.stringify(v)} → ${JSON.stringify(r.parameters[k])}`,
          );
  }
  for (const [id, r] of runLayers)
    if (!refLayers.has(id)) out.push(`layer ${id} (${r.module}): new`);
  return out.length > 40
    ? [...out.slice(0, 40), `… and ${out.length - 40} more`]
    : out;
}
