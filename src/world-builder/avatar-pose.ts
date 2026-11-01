import type * as T from "three";
import { WORLD_POSITION_LIMIT } from "./scene-bounds";

/**
 * Where the character stands and which way it is turned. Angles are radians.
 * `pitch` and `roll` are optional so recipes saved before they existed load
 * unchanged; absent means 0 (upright).
 */
export interface AvatarPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  roll?: number;
}

const KEYS = ["x", "y", "z", "yaw", "pitch", "roll"];
const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** Throws on an unknown key, an out-of-bounds position or an angle outside ±π. */
export function validateAvatarPose(pose: unknown): AvatarPose {
  if (typeof pose !== "object" || pose === null || Array.isArray(pose))
    throw new Error("Invalid avatar pose.");
  const p = pose as Record<string, unknown>;
  if (
    Object.keys(p).some((k) => !KEYS.includes(k)) ||
    ![p.x, p.y, p.z].every((v) =>
      finite(v, -WORLD_POSITION_LIMIT, WORLD_POSITION_LIMIT),
    ) ||
    !finite(p.yaw, -Math.PI, Math.PI) ||
    (p.pitch !== undefined && !finite(p.pitch, -Math.PI, Math.PI)) ||
    (p.roll !== undefined && !finite(p.roll, -Math.PI, Math.PI))
  )
    throw new Error("Invalid avatar pose.");
  return pose as AvatarPose;
}

/**
 * Turn the character's root (its origin is at the feet) by yaw, then pitch
 * about the turned body's side axis, then roll about its facing axis: Euler
 * order YXZ. Rotating about the feet lays a pitched or rolled body along the
 * floor instead of floating it at hip height. The character faces +Z at yaw 0,
 * so pitch +90° tips it forward onto its face and -90° onto its back.
 */
export function applyAvatarPose(object: T.Object3D, pose: AvatarPose) {
  object.position.set(pose.x, pose.y, pose.z);
  object.rotation.set(pose.pitch ?? 0, pose.yaw, pose.roll ?? 0, "YXZ");
}

// Wrap only out-of-range angles: atan2(sin, cos) moves some in-range values by
// one ulp, which would change an authored yaw after a Walk round trip.
const wrap = (a: number) =>
  a >= -Math.PI && a <= Math.PI ? a : Math.atan2(Math.sin(a), Math.cos(a));

/** Read a pose back, keeping pitch and roll out of the recipe while upright. */
export function readAvatarPose(object: T.Object3D): AvatarPose {
  const r = object.rotation;
  const pose: AvatarPose = {
    x: object.position.x,
    y: object.position.y,
    z: object.position.z,
    yaw: wrap(r.y),
  };
  if (r.order === "YXZ" && r.x) pose.pitch = wrap(r.x);
  if (r.order === "YXZ" && r.z) pose.roll = wrap(r.z);
  return pose;
}

/** Quick orientations for the inspector; each keeps position and yaw. */
export const ORIENTATIONS = [
  { label: "Upright", pitch: 0, roll: 0 },
  { label: "Lie face down", pitch: Math.PI / 2, roll: 0 },
  { label: "Lie on back", pitch: -Math.PI / 2, roll: 0 },
  { label: "On side", pitch: 0, roll: Math.PI / 2 },
] as const;

/** Set an orientation, dropping zero angles so an upright pose stays as before. */
export function orient(
  pose: AvatarPose,
  pitch: number,
  roll: number,
): AvatarPose {
  const { pitch: _p, roll: _r, ...rest } = pose;
  return {
    ...rest,
    ...(pitch ? { pitch } : {}),
    ...(roll ? { roll } : {}),
  };
}
