import { validateAvatarPose, type AvatarPose } from "./avatar-pose";
import { CAMERA_MOVE_BY_KEY, type CameraMoveKey } from "./camera-moves";
import { TAKE_FRAMES } from "./take-duration";

/**
 * One timed key of the character's path. `avatarPose` is the path at frame
 * 0; each key is reached at its `frame` and held after the last one. `fall`
 * eases the height in (gravity: slow at the key before, fastest arriving
 * here); position across the floor and the angles stay linear.
 */
export interface AvatarKey {
  frame: number;
  pose: AvatarPose;
  ease?: "linear" | "fall";
}

export const AVATAR_PATH_KEYS = 16;
const MAX_FRAME = TAKE_FRAMES.max - 1;

const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const frameOk = (v: unknown, after: number) =>
  Number.isInteger(v) && (v as number) > after && (v as number) <= MAX_FRAME;

/** Throws unless every key is known, frames rise from 1 and poses validate. */
export function validateAvatarPath(path: unknown): AvatarKey[] {
  if (!Array.isArray(path) || !path.length || path.length > AVATAR_PATH_KEYS)
    throw new Error(`avatarPath takes 1 to ${AVATAR_PATH_KEYS} keys.`);
  let last = 0;
  for (const key of path) {
    if (
      !plain(key) ||
      Object.keys(key).some((k) => !["frame", "pose", "ease"].includes(k)) ||
      !frameOk(key.frame, last) ||
      (key.ease !== undefined &&
        !["linear", "fall"].includes(key.ease as string))
    )
      throw new Error(
        `Invalid avatarPath key: frames rise from 1 to ${MAX_FRAME}, ease is linear or fall.`,
      );
    validateAvatarPose(key.pose);
    last = key.frame as number;
  }
  return path as AvatarKey[];
}

interface PathRecipe {
  avatarPose: AvatarPose;
  avatarPath?: AvatarKey[];
  cameraShot: string;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The character's pose at `frame`, a pure function of the recipe and the
 * frame index, so Capture, the depth pass and playback agree. Without a
 * path it is `avatarPose`, exactly as before.
 */
export function avatarPoseAt(r: PathRecipe, frame: number): AvatarPose {
  const path = r.avatarPath;
  if (!path?.length) return r.avatarPose;
  let from: AvatarKey = { frame: 0, pose: r.avatarPose };
  for (const key of path) {
    if (frame < key.frame) {
      const t = (frame - from.frame) / (key.frame - from.frame);
      const ty = key.ease === "fall" ? t * t : t;
      const a = from.pose,
        b = key.pose;
      const pose: AvatarPose = {
        x: mix(a.x, b.x, t),
        y: mix(a.y, b.y, ty),
        z: mix(a.z, b.z, t),
        yaw: mix(a.yaw, b.yaw, t),
      };
      const pitch = mix(a.pitch ?? 0, b.pitch ?? 0, t),
        roll = mix(a.roll ?? 0, b.roll ?? 0, t);
      if (pitch) pose.pitch = pitch;
      if (roll) pose.roll = roll;
      return pose;
    }
    from = key;
  }
  return from.pose;
}

/**
 * How far a tracking shot's camera and aim move at `frame`: the character's
 * travel from its start pose. Zero without a path or for a shot that does not
 * track the character (a custom or static camera stays where it was put).
 */
export function trackOffset(
  r: PathRecipe,
  frame: number,
): [number, number, number] {
  const move = CAMERA_MOVE_BY_KEY[r.cameraShot as CameraMoveKey];
  if (!r.avatarPath?.length || !move?.trackCharacter) return [0, 0, 0];
  const p = avatarPoseAt(r, frame),
    s = r.avatarPose;
  return [p.x - s.x, p.y - s.y, p.z - s.z];
}
