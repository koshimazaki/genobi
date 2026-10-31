import { validateRecipe, type Recipe } from "./recipe";
import { motionInstances } from "./scene-instances";
import {
  OUTDOOR_ZONE_DIMENSION_RANGE,
  scaleAcousticZones,
} from "./scene-acoustic-zones";
import {
  visitSceneMetrics,
  type SceneMetricVisitor,
} from "./scene-size-fields";
import { validateSceneSize } from "./scene-size-contract";
import { SCENE_SIZE_FACTOR_RANGE, WORLD_POSITION_LIMIT } from "./scene-bounds";
import { ROOM_DIMENSION_RANGE, ROOM_MARGIN } from "./scene-room";
import type { SceneVector } from "./scene-state";
export { sceneMetres, type SceneMetres } from "./scene-metres";

function stageRecipe(input: Recipe) {
  const recipe = validateRecipe(input);
  if (recipe.scene !== "stage")
    throw new Error("Scene sizing requires an authored Stage scene.");
  return recipe;
}

/** Absolute factors, narrowed by every authored metric and enclosure clearance. */
export function sceneSizeBounds(input: Recipe): { min: number; max: number } {
  const recipe = stageRecipe(input);
  const current = recipe.sceneSize?.factor ?? 1;
  let min: number = SCENE_SIZE_FACTOR_RANGE[0],
    max: number = SCENE_SIZE_FACTOR_RANGE[1];
  const visit: SceneMetricVisitor = (value, lo, hi) => {
    if (value) {
      const a = (lo / value) * current,
        b = (hi / value) * current;
      min = Math.max(min, Math.min(a, b));
      max = Math.min(max, Math.max(a, b));
    }
    return value;
  };
  visitSceneMetrics(recipe, visit);
  const point = (values: SceneVector) => {
    values.forEach((v) =>
      visit(v, -WORLD_POSITION_LIMIT, WORLD_POSITION_LIMIT),
    );
  };
  const interior = (values: SceneVector, dimensions: SceneVector) => {
    point(values);
    const [x, y, z] = values,
      [w, h, d] = dimensions;
    for (const clearance of [
      w / 2 - Math.abs(x),
      y,
      h - y,
      d / 2 - Math.abs(z),
    ])
      visit(clearance, ROOM_MARGIN, Infinity);
  };
  const motion = recipe.motion;
  if (motion?.instances)
    for (const part of motionInstances(motion.instances))
      point([part.x, part.y, part.z]);
  if (motion?.room) {
    const room = motion.room;
    interior(room.source, room.dimensions);
    interior(room.listener, room.dimensions);
    for (const key of motion.stateKeys) {
      const dimensions = key.room?.dimensions ?? room.dimensions;
      interior(key.room?.source ?? room.source, dimensions);
      interior(key.room?.listener ?? room.listener, dimensions);
    }
  }
  for (const zone of motion?.acousticZones ?? []) {
    point(zone.center);
    const [lo, hi] =
      zone.kind === "outdoor"
        ? OUTDOOR_ZONE_DIMENSION_RANGE
        : ROOM_DIMENSION_RANGE;
    zone.dimensions.forEach((value) => visit(value, lo, hi));
    if (zone.kind === "room") interior(zone.source, zone.dimensions);
  }
  for (const key of recipe.cameraMotion?.keys ?? [])
    visit(
      Math.hypot(...key.position.map((v, axis) => v - key.target[axis])),
      0.1,
      Infinity,
    );
  // Inward rounding makes slider endpoints safe even after decimal serialization.
  return {
    min: Math.min(current, Math.ceil(min * 1e6) / 1e6),
    max: Math.max(current, Math.floor(max * 1e6) / 1e6),
  };
}

/**
 * Bake one absolute size around the world origin. Body size, timing, angles,
 * materials and lens/depth settings remain physical properties of the take.
 * No renderer scale is applied and no enclosure is inferred from a voxel shape.
 */
export function resizeScene(input: Recipe, factor: number): Recipe {
  let recipe = stageRecipe(input);
  const size = validateSceneSize({ version: 1, factor });
  const current = recipe.sceneSize?.factor ?? 1;
  if (factor === current) return recipe;
  const bounds = sceneSizeBounds(recipe);
  if (factor < bounds.min || factor > bounds.max)
    throw new Error(
      `This scene supports sizes from ${bounds.min}× to ${bounds.max}×.`,
    );
  // Canonical recipe data cannot alias mutable transforms between states.
  // An in-memory author may reuse an object; scale each saved value once.
  recipe = JSON.parse(JSON.stringify(recipe)) as Recipe;
  const ratio = factor / current;
  // Micrometre precision avoids binary float strings exhausting the recipe budget.
  visitSceneMetrics(recipe, (value) => Math.round(value * ratio * 1e6) / 1e6);
  if (recipe.motion?.acousticZones)
    recipe.motion.acousticZones = scaleAcousticZones(
      recipe.motion.acousticZones,
      ratio,
      [0, 0, 0],
    );
  recipe.sceneSize = size;
  return validateRecipe(recipe);
}
