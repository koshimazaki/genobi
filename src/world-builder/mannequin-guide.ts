import { Euler, Quaternion, Vector3 } from "three";
import { avatarPoseAt } from "./avatar-path";
import type { Recipe, Prop } from "./recipe";

/** A human-scale schematic for non-WebGL previews, not a rig/clip renderer. */
export function mannequinGuide(recipe: Recipe, frame: number): Prop[] {
  if (!recipe.avatar || (recipe.avatarAsset ?? "mannequin") !== "mannequin")
    return [];
  const pose = avatarPoseAt(recipe, frame);
  const orientation = new Quaternion().setFromEuler(
    new Euler(pose.pitch ?? 0, pose.yaw, pose.roll ?? 0, "YXZ"),
  );
  const rotation = new Euler().setFromQuaternion(orientation, "XYZ");
  const parts = [
    ["head", 0, 1.67, 0, 0.24, 0.26, 0.24],
    ["neck", 0, 1.5, 0, 0.12, 0.08, 0.12],
    ["body", 0, 1.15, 0, 0.44, 0.62, 0.23],
    ["left-arm", -0.3, 1.1, 0, 0.14, 0.66, 0.16],
    ["right-arm", 0.3, 1.1, 0, 0.14, 0.66, 0.16],
    ["left-leg", -0.12, 0.42, 0, 0.18, 0.84, 0.2],
    ["right-leg", 0.12, 0.42, 0, 0.18, 0.84, 0.2],
  ] as const;
  return parts.map(([id, x, y, z, w, h, d]) => {
    const point = new Vector3(x, y, z).applyQuaternion(orientation);
    return {
      id: `mannequin-guide-${id}`,
      shape: "box",
      scale: 1,
      spin: 0,
      x: pose.x + point.x,
      y: pose.y + point.y,
      z: pose.z + point.z,
      scaleX: w,
      scaleY: h,
      scaleZ: d,
      rotationX: rotation.x,
      rotation: rotation.y,
      rotationZ: rotation.z,
      color: "#e8efcd",
      prompt: "1.8 m schematic mannequin",
    };
  });
}
