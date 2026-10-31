import type { Recipe } from "./recipe";
import { CAMERA_MOVES } from "./camera-moves";

export function loopCameraName(recipe: Recipe) {
  if (recipe.cameraMotion?.enabled && recipe.cameraMotion.base !== "legacy")
    return "Camera path";
  return (
    CAMERA_MOVES.find((move) => move.key === recipe.cameraShot)?.label ??
    "Custom framing"
  );
}
