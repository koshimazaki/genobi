import { useSyncExternalStore } from "react";
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

/**
 * Camera's neutral notice: what a Recreate in Camera restored and what it
 * did not. Not an error, so `ComposerAlerts` shows it as a status line
 * with "Dismiss notice"; errors keep their alert.
 */
let notice = "";
const listeners = new Set<() => void>();
export function setCameraNotice(next: string) {
  if (notice === next) return;
  notice = next;
  listeners.forEach((listener) => listener());
}
export function useCameraNotice() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => notice,
    () => "",
  );
}
