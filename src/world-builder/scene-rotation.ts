import { Euler, Quaternion, Vector3 } from "three";
import type { Prop } from "./recipe";
import type { SceneVector } from "./scene-state";

export interface SceneRotation {
  axis: "x" | "y" | "z";
  turns: number;
}

export function validateSceneRotation(
  value: unknown,
): asserts value is SceneRotation {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Choose a rotation axis and up to two turns.");
  const r = value as Record<string, unknown>;
  if (
    Object.keys(r).some((key) => key !== "axis" && key !== "turns") ||
    typeof r.axis !== "string" ||
    !["x", "y", "z"].includes(r.axis) ||
    typeof r.turns !== "number" ||
    !Number.isFinite(r.turns) ||
    Math.abs(r.turns) > 2
  )
    throw new Error("Choose a rotation axis and up to two turns.");
}

export function rotationAt(
  rotation: SceneRotation | undefined,
  frame: number,
  frames: number,
  loop = false,
) {
  if (!rotation?.turns) return undefined;
  const progress = Math.max(0, frame) / Math.max(1, loop ? frames : frames - 1);
  const angle = (progress * rotation.turns * 2 * Math.PI) % (2 * Math.PI);
  if (!angle) return undefined;
  const axis = new Vector3(
    rotation.axis === "x" ? 1 : 0,
    rotation.axis === "y" ? 1 : 0,
    rotation.axis === "z" ? 1 : 0,
  );
  return new Quaternion().setFromAxisAngle(axis, angle);
}

export function rotateAround(
  point: SceneVector,
  pivot: SceneVector,
  rotation: Quaternion,
): SceneVector {
  return new Vector3(...point)
    .sub(new Vector3(...pivot))
    .applyQuaternion(rotation)
    .add(new Vector3(...pivot))
    .toArray() as SceneVector;
}

export function rotateSceneObject(
  object: Prop,
  pivot: SceneVector,
  rotation: Quaternion,
): Prop {
  const position = rotateAround(
    [object.x, object.y, object.z],
    pivot,
    rotation,
  );
  const local = new Quaternion().setFromEuler(
    new Euler(
      object.rotationX ?? 0,
      object.rotation ?? 0,
      object.rotationZ ?? 0,
    ),
  );
  const orientation = new Euler().setFromQuaternion(
    rotation.clone().multiply(local),
    "XYZ",
  );
  return {
    ...object,
    x: position[0],
    y: position[1],
    z: position[2],
    rotationX: orientation.x,
    rotation: orientation.y,
    rotationZ: orientation.z,
  };
}
