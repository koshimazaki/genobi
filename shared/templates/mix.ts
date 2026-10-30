import type { GraphicsModule, Layer, Project } from "../director/types";

/**
 * A mix template: a finished edit of bundled media, cut to a track on a beat
 * grid, with graphics overlays and filters on top. Nothing in it is
 * generated, so it has no shots to plan; the cut is data
 * (`dimensions-mix.cut.json`) and `mixProject` turns it into a Director
 * project. The cut is in musical time (beats) and source seconds; frames are
 * derived from the composition's fps, which a mix takes from its clips, so
 * changing the fps or re-timing a slice is an edit to that data. See
 * docs/dimensions-mix.md.
 */
export interface MixShot {
  /** The media id in `media`: a clip, or a finished card (older cuts). */
  asset: string;
  label: string;
  /** Where the slice starts in its source, in seconds. */
  sourceSeconds: number;
  /** The beat it is cut on, from 0, and how many beats it lasts. */
  startBeat: number;
  beats: number;
  /**
   * For a square source: the top of the 16:9 window on a 1440 px square, so
   * a slice can frame the subject on its own. Null: a 16:9 source, shown
   * whole.
   */
  cropY: number | null;
  /**
   * Scales the slice past the frame from its centre, so a wider source (a
   * 2.35:1 clip) covers 16:9 instead of letterboxing. Absent: 1.
   */
  zoom?: number;
  /**
   * A camera move on a 16:9 slice: over its first `ease` beats it moves from
   * the whole frame (or `from`) to a window centred on (x, y) at `zoom`, then
   * drifts on by `drift` per second. Made of the slice's own video layers
   * (the picture is scaled from its source, so a 2× move on 4K footage keeps
   * native detail); `shotView` gives overlays the same move.
   */
  move?: ShotMove;
}
export interface ShotMove {
  x: number;
  y: number;
  zoom: number;
  ease: number;
  drift: number;
  /** Where the move starts; absent, the whole frame (a push-in). */
  from?: { x: number; y: number; zoom: number };
}
export interface MixLayer {
  id: string;
  name: string;
  /** A recipe in the trusted registry. */
  module: string;
  kind: "graphics" | "filter";
  /** Layers sharing a lane never overlap. */
  lane: string;
  /** In beats from 0; a glitch may last a fraction of one. */
  startBeat: number;
  beats: number;
  opacity: number;
  /** Holds the frame where no shot plays (a title or shader beat on its own). */
  card?: boolean;
  parameters: Record<string, string | number | boolean>;
}
export interface MixSpec {
  id: string;
  bpm: number;
  /** Where the excerpt starts in the full track, for the record. */
  inPointSeconds: number;
  /** The clips' own frame rate: a mix takes its fps from its sources. */
  fps: number;
  width: number;
  height: number;
  /** Original pixel typography size when the output default was raised. */
  designSize?: { width: number; height: number };
  /** The cut's length in beats. */
  beats: number;
  track: { asset: string; seconds: number };
  /** The audio layer's name in the editor. Absent: "Track · Dimensions". */
  trackName?: string;
  shots: MixShot[];
  layers: MixLayer[];
}
/** A media file as the bundle holds it. */
export interface MixMedia {
  kind: "video" | "audio";
  path: string;
  sha256: string;
  durationSeconds: number;
}

const SQUARE = 1440;
const ID = /^[a-z][a-z0-9-]{0,63}$/;

/** The frame a beat falls on, at the cut's tempo and fps. */
export const beatFrame = (spec: Pick<MixSpec, "bpm" | "fps">, beat: number) =>
  Math.round(((beat * 60) / spec.bpm) * spec.fps);
/** A stretch of beats as frames: where it starts and how long it lasts. */
export const beatSpan = (
  spec: Pick<MixSpec, "bpm" | "fps">,
  start: number,
  beats: number,
) => {
  const startFrame = beatFrame(spec, start);
  return {
    startFrame,
    durationFrames: Math.max(1, beatFrame(spec, start + beats) - startFrame),
  };
};
export const mixFrames = (spec: MixSpec) => beatFrame(spec, spec.beats);

/**
 * Structural rules for a cut: the shots tile the cut beat by beat, each on a
 * whole beat (from a card that holds the start, up to a card layer that
 * holds to the end), every slice
 * stays within its source, every layer fits the cut, ids are unique and
 * lanes never overlap.
 */
export function checkMix(spec: MixSpec, media: Record<string, MixMedia>) {
  const fail = (why: string): never => {
    throw new Error(`${spec.id}: ${why}`);
  };
  if (!Number.isInteger(spec.fps) || spec.fps < 1) fail("its fps is not whole");
  // Where no shot plays, cards hold the frame: graphics layers marked
  // `card`, at full opacity, that together cover every beat of the gap (the
  // teaser's title, its Paper Shaders and taste-layer beats).
  const cards = spec.layers
    .filter((l) => l.card && l.kind === "graphics" && l.opacity === 1)
    .sort((a, b) => a.startBeat - b.startBeat);
  const held = (from: number, to: number) => {
    let covered = from;
    for (const c of cards)
      if (c.startBeat <= covered && c.startBeat + c.beats > covered)
        covered = c.startBeat + c.beats;
    return covered >= to;
  };
  const first = spec.shots[0]?.startBeat ?? 0;
  if (first > 0 && !held(0, first))
    fail("nothing holds the frame before the first shot");
  let at = first;
  for (const [i, shot] of spec.shots.entries()) {
    if (
      shot.startBeat < at ||
      (shot.startBeat > at && !held(at, shot.startBeat))
    )
      fail(`shot ${i + 1} leaves a gap or overlaps`);
    if (!Number.isInteger(shot.startBeat) || !(shot.beats > 0))
      fail(`shot ${i + 1} is off the beat`);
    const m = media[shot.asset];
    if (m?.kind !== "video") fail(`shot ${i + 1} needs a video`);
    // In frames, as the project plays it: a slice may not run past its file.
    const { durationFrames } = beatSpan(spec, shot.startBeat, shot.beats);
    if (
      Math.round(shot.sourceSeconds * spec.fps) + durationFrames >
      Math.round(m.durationSeconds * spec.fps)
    )
      fail(`shot ${i + 1} runs past its source`);
    if (shot.zoom !== undefined && !(shot.zoom >= 1 && shot.zoom <= 4))
      fail(`shot ${i + 1} zooms outside 1 to 4`);
    if (shot.move) {
      const { x, y, zoom, ease, drift } = shot.move;
      const f = shot.move.from;
      if (
        (f &&
          !(
            f.zoom >= 1 &&
            f.zoom <= 4 &&
            f.x >= 0 &&
            f.x <= 1 &&
            f.y >= 0 &&
            f.y <= 1
          )) ||
        !(zoom >= 1 && zoom <= 4) ||
        !(x >= 0 && x <= 1 && y >= 0 && y <= 1) ||
        !(drift >= 0 && drift <= 0.2) ||
        !Number.isInteger(ease) ||
        !(ease >= 1 && ease < shot.beats) ||
        shot.cropY !== null
      )
        fail(`shot ${i + 1} has a camera move it cannot make`);
    }
    if (
      shot.cropY !== null &&
      !(
        shot.cropY >= 0 &&
        shot.cropY <= SQUARE - (SQUARE * spec.height) / spec.width
      )
    )
      fail(`shot ${i + 1} frames outside its source`);
    at = shot.startBeat + shot.beats;
  }
  // After the last shot, a card may hold to the end: cards as above, or one
  // opaque graphics layer from there to the cut's end (the Dimensions mix's
  // end card, which predates `card`).
  const endCard = spec.layers.some(
    (l) =>
      l.kind === "graphics" &&
      l.opacity === 1 &&
      l.startBeat === at &&
      l.startBeat + l.beats === spec.beats,
  );
  if (at > spec.beats || (at < spec.beats && !endCard && !held(at, spec.beats)))
    fail("the shots do not fill the cut");
  if (media[spec.track.asset]?.kind !== "audio") fail("the track is missing");
  if (
    Math.round(media[spec.track.asset].durationSeconds * spec.fps) <
    mixFrames(spec)
  )
    fail("the track is shorter than the cut");
  const ids = new Set<string>();
  const lanes = new Map<string, MixLayer[]>();
  for (const layer of spec.layers) {
    if (!ID.test(layer.id) || ids.has(layer.id))
      fail(`bad or repeated layer id ${layer.id}`);
    ids.add(layer.id);
    if (
      layer.startBeat < 0 ||
      !(layer.beats > 0) ||
      layer.startBeat + layer.beats > spec.beats + 1e-9
    )
      fail(`${layer.name} runs outside the cut`);
    lanes.set(layer.lane, [...(lanes.get(layer.lane) ?? []), layer]);
  }
  for (const [lane, members] of lanes) {
    const sorted = [...members].sort((a, b) => a.startBeat - b.startBeat);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].startBeat < sorted[i - 1].startBeat + sorted[i - 1].beats)
        fail(`lane ${lane} overlaps`);
  }
}

const still = { opacity: 1, scale: 1, rotationDegrees: 0 };

/** A point of a camera move: scale, and the picture's offset as fractions of the frame. */
export interface ViewKey {
  s: number;
  dx: number;
  dy: number;
}
const xyTo = (p: { x: number; y: number }) => ({ xTo: p.x, yTo: p.y });
const round = (v: number) => Math.round(v * 10000) / 10000;

/**
 * A slice's camera move as the project plays it: the push-in lasts `aFrames`
 * (from keys 0 to 1), the hold `bFrames` (keys 1 to 2), each eased linearly
 * over its frames as `visualAt` does. A window centred on (x, y) at zoom z
 * never leaves the frame; the picture moves by (0.5 - centre) × z.
 */
export function shotView(
  spec: Pick<MixSpec, "bpm" | "fps">,
  shot: MixShot,
): {
  aFrames: number;
  bFrames: number;
  keys: [ViewKey, ViewKey, ViewKey];
} | null {
  const m = shot.move;
  if (!m) return null;
  const all = beatSpan(spec, shot.startBeat, shot.beats);
  const aFrames = beatSpan(spec, shot.startBeat, m.ease).durationFrames;
  const bFrames = all.durationFrames - aFrames;
  const key = (z: number, x = m.x, y = m.y): ViewKey => {
    const half = 0.5 / z;
    const cx = Math.min(1 - half, Math.max(half, x));
    const cy = Math.min(1 - half, Math.max(half, y));
    return {
      s: round(z),
      dx: round((0.5 - cx) * z),
      dy: round((0.5 - cy) * z),
    };
  };
  const hold = (bFrames - 1) / spec.fps;
  return {
    aFrames,
    bFrames,
    keys: [
      m.from ? key(m.from.zoom, m.from.x, m.from.y) : { s: 1, dx: 0, dy: 0 },
      key(m.zoom),
      key(m.zoom * (1 + m.drift * hold)),
    ],
  };
}

/**
 * `shotView` as an overlay's `view` parameter, for an overlay that starts at
 * `atBeat` on that slice: "fps,aFrames,bFrames,offsetFrames;s,dx,dy;…" (three
 * keys). The pointer and focus box map their points through it, so they
 * stay on the control the picture shows. Empty for a slice with no move.
 */
export const viewParameter = (
  spec: Pick<MixSpec, "bpm" | "fps">,
  shot: MixShot,
  atBeat = shot.startBeat,
) => {
  const v = shotView(spec, shot);
  if (!v) return "";
  const offset = beatFrame(spec, atBeat) - beatFrame(spec, shot.startBeat);
  return `${spec.fps},${v.aFrames},${v.bFrames},${offset};${v.keys.map((k) => `${k.s},${k.dx},${k.dy}`).join(";")}`;
};

/**
 * The cut as a Director project at its fps: the track, the shots on one
 * lane (a square source is scaled to cover the frame and moved so its window
 * starts at `cropY`), then the filters and overlays in the order the cut
 * lists them, a lane's members kept together. Same spec and media: same
 * project.
 */
export function mixProject(
  spec: MixSpec,
  name: string,
  media: Record<string, MixMedia>,
  modules: Record<string, GraphicsModule>,
): Project {
  checkMix(spec, media);
  const { width, height, fps } = spec;
  const durationFrames = mixFrames(spec);
  const assets: Project["assets"] = {};
  for (const [id, m] of Object.entries(media))
    assets[id] = {
      kind: m.kind,
      use: "production",
      origin: "uploaded",
      durationSeconds: m.durationSeconds,
      file: { path: m.path, sha256: m.sha256 },
    };
  const used: Project["modules"] = {};
  for (const layer of spec.layers) {
    const m = modules[layer.module];
    if (!m) throw new Error(`${spec.id}: no recipe ${layer.module}`);
    used[layer.module] = m;
  }
  const layers: Layer[] = [
    {
      id: "track",
      name: spec.trackName ?? "Track · Dimensions",
      kind: "audio",
      assetId: spec.track.asset,
      sourceStartFrame: 0,
      gain: 1,
      startFrame: 0,
      durationFrames,
      locked: false,
    },
  ];
  for (const [i, shot] of spec.shots.entries()) {
    // A square source contained in the frame is `height` tall; scaled to
    // cover, it is `width` tall, and its window is moved to start at cropY.
    const square = shot.cropY !== null;
    const window = (SQUARE * height) / width;
    const y = square
      ? ((SQUARE / 2 - (shot.cropY! + window / 2)) / SQUARE) * width
      : 0;
    const id = `shot-${String(i + 1).padStart(2, "0")}`;
    const name = `${String(i + 1).padStart(2, "0")} ${shot.label}`;
    const span = beatSpan(spec, shot.startBeat, shot.beats);
    const base = {
      kind: "video" as const,
      assetId: shot.asset,
      fit: "contain" as const,
      track: "shots",
      locked: false,
      ...still,
    };
    const view = shot.move && shotView(spec, shot);
    if (!view) {
      layers.push({
        ...base,
        id,
        name,
        sourceStartFrame: Math.round(shot.sourceSeconds * fps),
        ...span,
        position: { x: 0, y: Math.round(y * 100) / 100 },
        scale: (square ? width / height : 1) * (shot.zoom ?? 1),
      });
      continue;
    }
    // The move as two layers of the same slice: the push-in, then the hold.
    const px = (v: ViewKey) => ({
      x: Math.round(v.dx * width * 100) / 100,
      y: Math.round(v.dy * height * 100) / 100,
    });
    const source = Math.round(shot.sourceSeconds * fps);
    layers.push({
      ...base,
      id,
      name,
      sourceStartFrame: source,
      startFrame: span.startFrame,
      durationFrames: view.aFrames,
      position: px(view.keys[0]),
      scale: view.keys[0].s,
      motion: {
        scaleTo: view.keys[1].s,
        ...xyTo(px(view.keys[1])),
        opacityTo: 1,
      },
    });
    layers.push({
      ...base,
      id: `${id}-hold`,
      name: `${name} · hold`,
      sourceStartFrame: source + view.aFrames,
      startFrame: span.startFrame + view.aFrames,
      durationFrames: view.bFrames,
      position: px(view.keys[1]),
      scale: view.keys[1].s,
      motion: {
        scaleTo: view.keys[2].s,
        ...xyTo(px(view.keys[2])),
        opacityTo: 1,
      },
    });
  }
  const shared = new Map<string, number>();
  for (const l of spec.layers)
    shared.set(l.lane, (shared.get(l.lane) ?? 0) + 1);
  for (const lane of new Set(spec.layers.map((l) => l.lane)))
    for (const l of spec.layers
      .filter((x) => x.lane === lane)
      .sort((a, b) => a.startBeat - b.startBeat)) {
      const base = {
        id: l.id,
        name: l.name,
        moduleId: l.module,
        parameters: l.parameters,
        ...beatSpan(spec, l.startBeat, l.beats),
        locked: false,
        ...(shared.get(lane)! > 1 ? { track: lane } : {}),
      };
      layers.push(
        l.kind === "filter"
          ? { ...base, kind: "filter", input: "composite-below" }
          : {
              ...base,
              kind: "graphics",
              ...still,
              opacity: l.opacity,
              position: { x: 0, y: 0 },
            },
      );
    }
  return {
    schemaVersion: "director.bundle.v1",
    id: spec.id,
    name,
    revision: 1,
    composition: {
      fps,
      durationFrames,
      width,
      height,
      ...(spec.designSize ? { designSize: spec.designSize } : {}),
      colorSpace: "srgb",
      alpha: "straight",
      background: "#0c0e0c",
      bpm: spec.bpm,
      beatsPerBar: 4,
    },
    assets,
    modules: used,
    layers,
    generationPlans: [],
    generations: [],
  };
}
