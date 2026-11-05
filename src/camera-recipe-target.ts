import { useSyncExternalStore } from "react";
import type { Job } from "../shared/types";
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
  /**
   * The asset's recorded settings, restored through Camera's own restore
   * before the patch (references) lands. Absent: the patch alone.
   */
  job?: Job;
  /** A workflow run's recorded run location, saved for the session. */
  location?: "local" | "cloud";
  /**
   * An MP4 the person chose to use in Camera (an expanded Assets card's Use
   * in Camera): the composer uploads it as Upscale's source, exactly as the
   * Upscale drop zone does, and selects it. An upload, never a generation.
   */
  video?: File;
}
/**
 * A recreated upscale's source the project cannot name. A source id no
 * source has, so Camera neither falls back to the newest generated clip nor
 * enables Generate (`composerBlocked`) until the person picks a source.
 */
export const SOURCE_UNRESOLVED = "__source-unresolved__";

type Target = (recipe: CameraRecipePatch) => void;
let target: Target | undefined;

/**
 * A recipe handed over before the composer mounted (Camera opening for the
 * first time): it waits here and lands, patch and note, the moment the
 * composer registers, so references are replaced on that path too. A held
 * recipe older than this is dropped rather than landing on a later visit.
 */
const HOLD_MS = 15_000;
let held: { recipe: CameraRecipePatch; at: number } | undefined;

/**
 * A Director-to-Camera handoff can wait for a saved still to load. The newer
 * handoff (or leaving Camera) invalidates any earlier in-flight request; a
 * late image fetch must never replace the user's newly selected prompt,
 * model or references before a paid Generate.
 */
let handoffGeneration = 0;
export function beginCameraRecipeHandoff() {
  held = undefined;
  return ++handoffGeneration;
}
export function currentCameraRecipeHandoff(generation: number) {
  return generation === handoffGeneration;
}
export function cancelCameraRecipeHandoff() {
  ++handoffGeneration;
  held = undefined;
}

/** Registers the composer; returns the cleanup. The newest wins. */
export function onCameraRecipe(next: Target) {
  target = next;
  const waiting = held;
  held = undefined;
  if (waiting && Date.now() - waiting.at <= HOLD_MS) next(waiting.recipe);
  return () => {
    if (target === next) target = undefined;
  };
}

/** True when a composer took the recipe now; false when it waits for one. */
export function applyCameraRecipe(recipe: CameraRecipePatch) {
  if (!target) {
    held = { recipe, at: Date.now() };
    return false;
  }
  held = undefined;
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
export function cameraNotice() {
  return notice;
}
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
