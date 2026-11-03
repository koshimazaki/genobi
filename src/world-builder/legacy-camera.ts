import type { Recipe } from "./recipe";
import { cameraProgressAt } from "./loop";
import { trackOffset } from "./avatar-path";

/** The existing analytic named-camera movement, shared with added path modifiers. */
export function legacyCameraTargetAt(recipe: Recipe, frame: number) {
  const [dx, dy, dz] = trackOffset(recipe, frame);
  return [
    recipe.targetX + dx,
    recipe.targetY + dy,
    recipe.targetZ + dz,
  ] as const;
}

export function legacyCameraAt(recipe: Recipe, frame: number) {
  const { turn, sweep } = cameraProgressAt(recipe, frame);
  const a = ((recipe.azimuth + recipe.orbit * turn) * Math.PI) / 180;
  const e =
    ((recipe.elevation +
      ((recipe.elevationEnd ?? recipe.elevation) - recipe.elevation) * sweep) *
      Math.PI) /
    180;
  const radius = recipe.radius * (1 + recipe.dolly * sweep);
  const [x, y, z] = legacyCameraTargetAt(recipe, frame);
  return [
    x + Math.sin(a) * Math.cos(e) * radius,
    y + Math.sin(e) * radius,
    z + Math.cos(a) * Math.cos(e) * radius,
  ] as const;
}
