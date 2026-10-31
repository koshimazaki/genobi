import type { AvatarPose } from "./avatar-pose";
import type { AvatarKey } from "./avatar-path";

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Shared interpolation for rendering and truncating off-take path endpoints. */
export function sampleAvatarPath(
  recipe: { avatarPose: AvatarPose; avatarPath?: AvatarKey[] },
  frame: number,
): AvatarPose {
  const path = recipe.avatarPath;
  if (!path?.length) return recipe.avatarPose;
  let from: AvatarKey = { frame: 0, pose: recipe.avatarPose };
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
