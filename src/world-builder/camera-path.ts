import {
  cameraPathFromSamples,
  CAMERA_PATH_LIMITS,
  type CameraPath,
} from "../../shared/camera-path";
import type { CameraMoveKey } from "./camera-moves";
import { shotPatch } from "./camera-shots";
import {
  cameraAt,
  cameraTargetAt,
  cameraFovAt,
  validateRecipe,
  type Recipe,
} from "./recipe";

/**
 * A recipe's camera move as a shared camera path. Keys sit on the take's
 * frame grid (every `step` frames, always including the last), so the path's
 * span is (frames - 1) / fps and the recipe's curve is baked into the keys.
 * At step 1 the path replays `cameraAt` exactly on every frame.
 */
export function recipeCameraPath(
  input: Recipe,
  { step = 1 }: { step?: number } = {},
): CameraPath {
  const recipe = validateRecipe(input);
  const last = recipe.frames - 1;
  const stride = Math.max(1, Math.min(last, Math.floor(step) || 1));
  const frames = Array.from(
    { length: Math.floor(last / stride) + 1 },
    (_, i) => i * stride,
  );
  if (frames[frames.length - 1] !== last) frames.push(last);
  if (frames.length > CAMERA_PATH_LIMITS.maxKeys)
    throw new Error("Too many camera keys; use a larger step.");
  return cameraPathFromSamples(
    frames.map((frame) => ({
      time: frame / recipe.fps,
      position: [...cameraAt(recipe, frame)],
      target: [...cameraTargetAt(recipe, frame)],
      fov: cameraFovAt(recipe, frame),
    })),
  );
}

/** One of the World Builder's preset shots (Holodeck's vocabulary) as a path. */
export function shotCameraPath(
  key: CameraMoveKey,
  recipe: Recipe,
  options: { step?: number; subject?: [number, number, number] } = {},
): CameraPath {
  return recipeCameraPath(
    { ...recipe, ...shotPatch(key, recipe, options.subject) },
    options,
  );
}
