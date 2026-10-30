/**
 * A portable camera path: keyframes of position, target, field of view and
 * roll over normalised time, with an ease per segment. It is the one shape a
 * recorded, preset or agent-authored move takes between the browser, an agent
 * and the server, so every value is bounded and every field is allowlisted.
 *
 * It is not yet part of a generation request. Nothing here claims a model
 * follows a path; `describeCameraPath` (`camera-path-terms.ts`) only names the
 * nearest documented camera term.
 */
import {
  applyCameraEase,
  clamp01,
  isCameraEase,
  type CameraEaseKey,
} from "./camera-ease";

export const CAMERA_PATH_VERSION = 1;

export const CAMERA_PATH_LIMITS = {
  /** One key per frame of the longest World Builder take (241) fits. */
  maxKeys: 256,
  minDurationSeconds: 0.1,
  maxDurationSeconds: 60,
  /** Scene units; World Builder scenes stay within ±60. */
  maxCoordinate: 1000,
  /** Vertical field of view, degrees. */
  minFov: 5,
  maxFov: 150,
  /** Roll about the view axis, degrees. */
  maxRoll: 180,
  /** Below this the camera has no defined view direction. */
  minTargetDistance: 1e-3,
} as const;

export type CameraPathVec3 = [number, number, number];

export interface CameraPathKey {
  /** Normalised time: 0 is the path's start, 1 its end. */
  t: number;
  position: CameraPathVec3;
  /** The point the camera looks at. */
  target: CameraPathVec3;
  fov: number;
  roll: number;
  /** Ease of the segment leaving this key. Absent on the last key. */
  ease?: CameraEaseKey;
}

export interface CameraPath {
  version: typeof CAMERA_PATH_VERSION;
  /** Seconds from the first key to the last. */
  duration: number;
  keys: CameraPathKey[];
}

export interface CameraPathPose {
  position: CameraPathVec3;
  target: CameraPathVec3;
  fov: number;
  roll: number;
}

export class CameraPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CameraPathError";
  }
}

const PATH_FIELDS = new Set(["version", "duration", "keys"]);
const KEY_FIELDS = new Set(["t", "position", "target", "fov", "roll", "ease"]);
const L = CAMERA_PATH_LIMITS;

const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

function vec3(value: unknown, name: string): CameraPathVec3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((v) => finite(v, -L.maxCoordinate, L.maxCoordinate))
  )
    throw new CameraPathError(
      `${name} must be three finite numbers within ±${L.maxCoordinate}.`,
    );
  return [value[0], value[1], value[2]];
}

function validateKey(input: unknown, index: number, last: boolean) {
  const at = `Key ${index}`;
  if (!plain(input)) throw new CameraPathError(`${at} must be an object.`);
  if (Object.keys(input).some((field) => !KEY_FIELDS.has(field)))
    throw new CameraPathError(`${at} has an unknown field.`);
  if (!finite(input.t, 0, 1))
    throw new CameraPathError(`${at} time must be between 0 and 1.`);
  const position = vec3(input.position, `${at} position`);
  const target = vec3(input.target, `${at} target`);
  if (distance(position, target) < L.minTargetDistance)
    throw new CameraPathError(`${at} target must differ from its position.`);
  if (!finite(input.fov, L.minFov, L.maxFov))
    throw new CameraPathError(
      `${at} fov must be between ${L.minFov} and ${L.maxFov} degrees.`,
    );
  const roll = input.roll ?? 0;
  if (!finite(roll, -L.maxRoll, L.maxRoll))
    throw new CameraPathError(
      `${at} roll must be within ±${L.maxRoll} degrees.`,
    );
  const ease = input.ease ?? "linear";
  if (!isCameraEase(ease))
    throw new CameraPathError(`${at} has an unknown ease.`);
  const key: CameraPathKey = {
    t: input.t,
    position,
    target,
    fov: input.fov,
    roll,
  };
  if (!last) key.ease = ease;
  return key;
}

/**
 * Validate untrusted input and return a canonical copy: fixed field order,
 * roll defaulting to 0, ease defaulting to linear and dropped from the last
 * key, where no segment uses it. Throws `CameraPathError`.
 */
export function validateCameraPath(input: unknown): CameraPath {
  if (!plain(input))
    throw new CameraPathError("Expected a camera path object.");
  if (Object.keys(input).some((field) => !PATH_FIELDS.has(field)))
    throw new CameraPathError("Camera path has an unknown field.");
  if (input.version !== CAMERA_PATH_VERSION)
    throw new CameraPathError("Unsupported camera path version.");
  if (!finite(input.duration, L.minDurationSeconds, L.maxDurationSeconds))
    throw new CameraPathError(
      `Duration must be between ${L.minDurationSeconds} and ${L.maxDurationSeconds} seconds.`,
    );
  const keys = input.keys;
  if (!Array.isArray(keys) || keys.length < 2 || keys.length > L.maxKeys)
    throw new CameraPathError(`Use between 2 and ${L.maxKeys} keys.`);
  const out = keys.map((key, i) => validateKey(key, i, i === keys.length - 1));
  if (out[0].t !== 0 || out[out.length - 1].t !== 1)
    throw new CameraPathError("The first key must be at 0 and the last at 1.");
  for (let i = 1; i < out.length; i++) {
    if (out[i].t <= out[i - 1].t)
      throw new CameraPathError("Key times must strictly increase.");
    if (segmentSeparation(out[i - 1], out[i]) < L.minTargetDistance)
      throw new CameraPathError(
        `Between keys ${i - 1} and ${i} the camera passes through its target.`,
      );
  }
  return { version: CAMERA_PATH_VERSION, duration: input.duration, keys: out };
}

/**
 * Closest camera-to-target distance anywhere along a segment. Sampling mixes
 * position and target with the same eased weight, and every ease maps 0..1
 * onto 0..1, so the offset sweeps the straight line between the two keys'
 * offsets whatever the ease: the closest approach to zero is exact.
 */
function segmentSeparation(a: CameraPathKey, b: CameraPathKey): number {
  const from = [0, 1, 2].map((n) => a.position[n] - a.target[n]);
  const step = [0, 1, 2].map((n) => b.position[n] - b.target[n] - from[n]);
  const dot = (x: number[], y: number[]) =>
    x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const run = dot(step, step);
  const u = run > 0 ? clamp01(-dot(from, step) / run) : 0;
  return Math.hypot(...from.map((v, n) => v + step[n] * u));
}

export interface CameraPathSample {
  /** Seconds from the first sample; any start offset is removed. */
  time: number;
  position: CameraPathVec3;
  target: CameraPathVec3;
  fov: number;
  roll?: number;
}

/**
 * Build a path from timed samples, such as a recorded or rendered move.
 * Segments are linear: the samples already carry any easing.
 */
export function cameraPathFromSamples(
  samples: readonly CameraPathSample[],
): CameraPath {
  if (samples.length < 2 || samples.length > L.maxKeys)
    throw new CameraPathError(`Use between 2 and ${L.maxKeys} samples.`);
  const start = samples[0].time;
  const duration = samples[samples.length - 1].time - start;
  return validateCameraPath({
    version: CAMERA_PATH_VERSION,
    duration,
    keys: samples.map((s, i) => ({
      t: i === samples.length - 1 ? 1 : (s.time - start) / duration,
      position: s.position,
      target: s.target,
      fov: s.fov,
      roll: s.roll ?? 0,
      ease: "linear",
    })),
  });
}

/** Pose at normalised time `t` (clamped to 0..1) of a validated path. */
export function sampleCameraPath(path: CameraPath, t: number): CameraPathPose {
  const time = clamp01(t);
  const keys = path.keys;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= time) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const u = applyCameraEase(a.ease ?? "linear", (time - a.t) / (b.t - a.t));
  const mix = (x: number, y: number) => x + (y - x) * u;
  return {
    position: [0, 1, 2].map((n) =>
      mix(a.position[n], b.position[n]),
    ) as CameraPathVec3,
    target: [0, 1, 2].map((n) =>
      mix(a.target[n], b.target[n]),
    ) as CameraPathVec3,
    fov: mix(a.fov, b.fov),
    roll: mix(a.roll, b.roll),
  };
}

export function distance(a: CameraPathVec3, b: CameraPathVec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
