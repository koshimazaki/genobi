/**
 * Name a camera path in the studio's documented vocabulary (`camera.ts`).
 * Each section gets the nearest term the chosen model's guide names, or null
 * when no documented term fits: a zoom, a roll, a downward tilt, a move that
 * turns back, or two motions at once. Movement is read at every key and
 * between keys, so a change that returns by the end still counts. The thresholds are this studio's reading of the terms' descriptions
 * and illustrative poses, not provider guidance, and naming a term is no claim
 * that a model will follow the path. See docs/camera-wording.md.
 */
import {
  cameraSections,
  cameraTerms,
  emptyCamera,
  termsFor,
  type CameraSelection,
  type CameraTermId,
  type PoseSettings,
} from "./camera";
import {
  distance,
  sampleCameraPath,
  type CameraPath,
  type CameraPathPose,
  type CameraPathVec3,
} from "./camera-path";
import type { VideoModel } from "./types";

export interface DescribeCameraPathOptions {
  /** Defaults to FLUX 3, like the rest of `camera.ts`. */
  model?: VideoModel;
  /**
   * Subject height in scene units. A path carries no subject, so shot size
   * is named only when the caller knows how tall the subject is.
   */
  subjectHeight?: number;
}

const SAMPLES = 64;
const deg = (radians: number) => (radians * 180) / Math.PI;
const sub = (a: CameraPathVec3, b: CameraPathVec3): CameraPathVec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const len = (v: CameraPathVec3) => Math.hypot(...v);
const dot = (a: CameraPathVec3, b: CameraPathVec3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A vector's elevation, degrees above the horizontal. */
const elevation = (v: CameraPathVec3) =>
  deg(Math.asin(Math.max(-1, Math.min(1, v[1] / len(v)))));
const yaw = (v: CameraPathVec3) => deg(Math.atan2(v[0], v[2]));
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * Frame height as a fraction of subject height, upper bound per term, from
 * the terms' descriptions: macro and extreme close-up show one detail, a
 * close-up the upper part, medium from the waist, cowboy from mid-thigh, full
 * the whole subject, wide some surroundings, establishing the whole setting.
 */
const SHOT_FRAMING: readonly [CameraTermId, number][] = [
  ["macro", 0.06],
  ["extreme-close-up", 0.15],
  ["close-up", 0.35],
  ["medium", 0.6],
  ["cowboy", 0.85],
  ["full", 1.6],
  ["wide", 4],
  ["establishing", Infinity],
];

/** Angle terms placed by elevation; Dutch is read from roll, profile needs the subject's facing. */
const ELEVATION_ANGLES: readonly CameraTermId[] = [
  "eye-level",
  "low-angle",
  "high-angle",
  "birds-eye",
  "worms-eye",
  "aerial",
];
const ANGLE_TOLERANCE = 15;
const DUTCH_ROLL = 10;

/** A motion counts once it passes these; two counting at once is not one term. */
const MOTION = {
  /**
   * Arc's illustrative sweep is 65° and Orbit's a full turn. From 150° either
   * fits (the LTX orbit sentence ends on the subject's far side); from 270°
   * only Orbit does.
   */
  orbitDegrees: 20,
  orbitEitherDegrees: 150,
  orbitOnlyDegrees: 270,
  dollyRatio: 1.25,
  craneDegrees: 10,
  aimDegrees: 5,
  fovRatio: 1.1,
  /** Roll about the view axis; no documented movement term rolls. */
  rollDegrees: 5,
  /** Fractions of the starting camera-to-target distance. */
  fixed: 0.05,
  /** Cosine between the camera's travel and its right vector for trucking. */
  sideways: 0.7,
  travel: 0.1,
  still: 0.02,
};

function available(
  candidates: readonly CameraTermId[],
  model: VideoModel,
): CameraTermId | null {
  const offered = cameraSections.flatMap((s) =>
    termsFor(s, model).map((t) => t.id),
  );
  return candidates.find((id) => offered.includes(id)) ?? null;
}

function shotSize(start: CameraPathPose, subjectHeight: number | undefined) {
  if (!(typeof subjectHeight === "number" && subjectHeight > 0)) return null;
  const d = distance(start.position, start.target);
  const frame = (2 * d * Math.tan((start.fov * Math.PI) / 360)) / subjectHeight;
  return SHOT_FRAMING.find(([, upTo]) => frame < upTo)?.[0] ?? null;
}

function angle(start: CameraPathPose): CameraTermId | null {
  if (Math.abs(start.roll) >= DUTCH_ROLL) return "dutch";
  const e = elevation(sub(start.position, start.target));
  let best: CameraTermId | null = null;
  let gap = ANGLE_TOLERANCE;
  for (const id of ELEVATION_ANGLES) {
    const pose: PoseSettings | undefined = cameraTerms.find(
      (t) => t.id === id,
    )?.pose;
    const diff = Math.abs(e - (pose?.elevation ?? 0));
    if (diff <= gap) [best, gap] = [id, diff];
  }
  return best;
}

/**
 * Poses at every key and evenly between keys, so a change that happens and
 * reverses inside the path is seen, not only its start and end.
 */
function readPoses(path: CameraPath): CameraPathPose[] {
  const keys = path.keys;
  const per = Math.max(2, Math.ceil(SAMPLES / (keys.length - 1)));
  const out: CameraPathPose[] = [];
  for (let i = 0; i < keys.length - 1; i++)
    for (let j = 0; j < per; j++)
      out.push(
        sampleCameraPath(
          path,
          keys[i].t + ((keys[i + 1].t - keys[i].t) * j) / per,
        ),
      );
  out.push(sampleCameraPath(path, 1));
  return out;
}

/**
 * A series' net change from its first value, and how far it runs back
 * against that change: 0 for a one-way move, the whole span for out-and-back.
 */
function change(series: readonly number[]) {
  const net = series[series.length - 1] - series[0];
  const span = Math.max(...series) - Math.min(...series);
  return { net, span, back: span - Math.abs(net) };
}

/** Running unwrapped horizontal turn of a direction series, degrees. */
function sweep(directions: readonly CameraPathVec3[], d0: number): number[] {
  let total = 0;
  let previous: number | null = null;
  return directions.map((v) => {
    if (Math.hypot(v[0], v[2]) >= 1e-6 * d0) {
      const a = yaw(v);
      if (previous !== null) total += wrap(a - previous);
      previous = a;
    }
    return total;
  });
}

function movement(path: CameraPath): CameraTermId[] {
  const poses = readPoses(path);
  const a = poses[0];
  const b = poses[poses.length - 1];
  const offsets = poses.map((p) => sub(p.position, p.target));
  const oa = offsets[0];
  const d0 = len(oa);
  /** Furthest any pose strays from the first, as a fraction of d0. */
  const reach = (vectors: readonly CameraPathVec3[]) =>
    Math.max(...vectors.map((v) => distance(v, vectors[0]))) / d0;
  const camera = reach(poses.map((p) => p.position));
  const target = reach(poses.map((p) => p.target));
  const found: CameraTermId[][] = [];
  // A zoom or a roll, even one that returns: the studio documents neither.
  const fov = change(poses.map((p) => Math.log(p.fov)));
  if (fov.span >= Math.log(MOTION.fovRatio)) found.push([]);
  const roll = change(poses.map((p) => p.roll));
  if (roll.span >= MOTION.rollDegrees) found.push([]);
  if (target < MOTION.travel) {
    // The camera moves relative to a fixed target.
    const orbit = change(sweep(offsets, d0));
    const dolly = change(offsets.map((o) => Math.log(len(o) / d0)));
    const lift = change(offsets.map(elevation));
    const turn = Math.abs(orbit.net);
    if (orbit.back >= MOTION.orbitDegrees) found.push([]);
    else if (turn >= MOTION.orbitOnlyDegrees) found.push(["orbit"]);
    else if (turn >= MOTION.orbitEitherDegrees) found.push(["arc", "orbit"]);
    else if (turn >= MOTION.orbitDegrees) found.push(["arc"]);
    const dollyLog = Math.log(MOTION.dollyRatio);
    if (dolly.back >= dollyLog) found.push([]);
    else if (dolly.net <= -dollyLog) found.push(["dolly-in"]);
    else if (dolly.net >= dollyLog) found.push(["pull-back"]);
    if (lift.back >= MOTION.craneDegrees) found.push([]);
    else if (lift.net >= MOTION.craneDegrees) found.push(["crane"]);
    else if (lift.net <= -MOTION.craneDegrees) found.push(["jib-down"]);
    if (!found.length && camera < MOTION.still && target < MOTION.still)
      return ["static"];
  } else if (camera < MOTION.fixed) {
    // The camera stays put and its aim turns.
    const aims = poses.map((p) => sub(p.target, p.position));
    const turn = change(sweep(aims, d0));
    const tilt = change(aims.map(elevation));
    if (turn.back >= MOTION.aimDegrees) found.push([]);
    // A right turn reads as a falling yaw; H3 names the direction, the others Pan.
    else if (Math.abs(turn.net) >= MOTION.aimDegrees)
      found.push([turn.net < 0 ? "pan-right" : "pan-left", "pan"]);
    if (tilt.back >= MOTION.aimDegrees) found.push([]);
    else if (tilt.net >= MOTION.aimDegrees) found.push(["tilt"]);
    else if (tilt.net <= -MOTION.aimDegrees) found.push([]); // No documented downward tilt.
  } else if (reach(offsets) < MOTION.travel) {
    // Camera and target travel together: sideways is trucking, otherwise follow.
    const move = sub(b.position, a.position);
    const run = len(move);
    const along = change(
      poses.map((p) => dot(sub(p.position, a.position), move) / (run || 1)),
    );
    if (run / d0 < MOTION.fixed || along.back / d0 >= MOTION.travel)
      found.push([]); // It travels and comes back.
    else {
      const forward = sub(a.target, a.position);
      const right: CameraPathVec3 = [-forward[2], 0, forward[0]];
      const side =
        (move[0] * right[0] + move[2] * right[2]) / (run * len(right) || 1);
      if (Math.abs(side) >= MOTION.sideways)
        found.push([side < 0 ? "dolly-left" : "dolly-right", "trucking"]);
      else found.push(["follow"]);
    }
  } else found.push([]);
  return found.length === 1 ? found[0] : [];
}

/**
 * The nearest documented term per section for a validated path, or null.
 * Shot size and angle are read at the first key; movement over the whole path.
 */
export function describeCameraPath(
  path: CameraPath,
  options: DescribeCameraPathOptions = {},
): CameraSelection {
  const model = options.model ?? "flux-3";
  const start = sampleCameraPath(path, 0);
  const pick = (id: CameraTermId | null) =>
    id ? available([id], model) : null;
  return {
    ...emptyCamera,
    "shot-sizes": pick(shotSize(start, options.subjectHeight)),
    angles: pick(angle(start)),
    movements: available(movement(path), model),
  } as CameraSelection;
}
