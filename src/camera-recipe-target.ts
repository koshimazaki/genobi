import type { ComposerState } from "./useComposer";

/**
 * Where a Director slot's Recreate in Camera lands (#57): the Camera
 * composer registers itself, and the Director hands it a patch (model,
 * prompt, reference images) plus a note naming anything not stored. It goes
 * through the composer's own `update`, so it is an ordinary edit the
 * restore guard keeps. Nothing here submits; Generate stays the person's.
 */
export interface CameraRecipePatch {
  patch: Partial<ComposerState>;
  /** Said in Camera's notice line; "" when everything was restored. */
  note: string;
}
type Target = (recipe: CameraRecipePatch) => void;
let target: Target | undefined;

/** Registers the composer; returns the cleanup. The newest wins. */
export function onCameraRecipe(next: Target) {
  target = next;
  return () => {
    if (target === next) target = undefined;
  };
}

/** True when a composer took the recipe. */
export function applyCameraRecipe(recipe: CameraRecipePatch) {
  if (!target) return false;
  target(recipe);
  return true;
}
