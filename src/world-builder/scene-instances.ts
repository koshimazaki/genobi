import type { Prop, Recipe } from "./recipe";
import type { SceneInstances } from "./scene-state";

/** Stable material and lattice membership per ID, independent of evaluation order. */
export function motionInstances(group: SceneInstances): Prop[] {
  const rows = Math.ceil(group.count / (group.columns * group.columns));
  const order = Array.from({ length: group.count }, (_, i) => i);
  let seed = group.seed >>> 0;
  for (let i = order.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((cell, i) => ({
    id: `voxel-${String(i).padStart(3, "0")}`,
    shape: "box",
    x: ((cell % group.columns) - (group.columns - 1) / 2) * group.spacing,
    y:
      (Math.floor(cell / (group.columns * group.columns)) - (rows - 1) / 2) *
      group.spacing,
    z:
      ((Math.floor(cell / group.columns) % group.columns) -
        (group.columns - 1) / 2) *
      group.spacing,
    scale: group.size,
    spin: 0,
    color: group.palette[i % group.palette.length],
    prompt: "",
  }));
}

/** Authored primitives and bounded instances; generated room walls stay separate. */
export function sceneObjects(
  recipe: Pick<Recipe, "objects" | "motion">,
): Prop[] {
  return recipe.motion?.instances
    ? [...recipe.objects, ...motionInstances(recipe.motion.instances)]
    : recipe.objects;
}
