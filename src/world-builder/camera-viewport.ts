import { validateRecipe, type Recipe } from "./recipe";

/** A frozen viewport becomes the shot; a saved path must not override its framing. */
export function viewportShotRecipe(current: Recipe, viewport: Partial<Recipe>) {
  return validateRecipe({
    ...current,
    ...viewport,
    cameraShot: "custom",
    ...(current.cameraMotion
      ? { cameraMotion: { ...current.cameraMotion, enabled: false } }
      : {}),
  });
}
