import type { Recipe } from "./recipe";

/**
 * What may change while walking: the character, and the sound (the track's
 * envelope and the Sound tab's routing), so audio stays live in every mode,
 * and the take's length (frames or seconds).
 * Everything else is the set, edited from Shot camera or Build.
 */
export const WALK_EDITABLE: readonly (keyof Recipe)[] = [
  // The take's length is not the set, so it can change while walking.
  "frames",
  "seconds",
  "avatar",
  "avatarAsset",
  "avatarMotion",
  "creatureReference",
  "envelope",
  "bandEnvelopes",
  "audioRoutes",
];

/** Throws when a walking edit would change the set. */
export function assertWalkEdit(current: Recipe, next: Recipe) {
  for (const key of Object.keys(next) as (keyof Recipe)[])
    if (
      !WALK_EDITABLE.includes(key) &&
      JSON.stringify(next[key]) !== JSON.stringify(current[key])
    )
      throw new Error("Return to Shot camera to edit the set.");
  if (!next.avatar) throw new Error("Choose a character while walking.");
}
