import { SCENE_SIZE_FACTOR_RANGE } from "./scene-bounds";

/** The factor already baked into metric scene data; never a renderer scale. */
export interface SceneSize {
  version: 1;
  factor: number;
}

export function validateSceneSize(input: unknown): SceneSize {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["version", "factor"].includes(key))
  )
    throw new Error("Invalid scene size metadata.");
  const value = input as Partial<SceneSize>;
  if (
    value.version !== 1 ||
    typeof value.factor !== "number" ||
    !Number.isFinite(value.factor) ||
    value.factor < SCENE_SIZE_FACTOR_RANGE[0] ||
    value.factor > SCENE_SIZE_FACTOR_RANGE[1]
  )
    throw new Error("Scene size must be between 0.25× and 4×.");
  return { version: 1, factor: value.factor };
}
