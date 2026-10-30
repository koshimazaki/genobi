import { findNamedTake, type NamedTake } from "./named-takes";
import type { Recipe } from "./recipe";
import { takeSoundWav } from "./take-sound";
import type { BuilderSession } from "./useBuilderSession";

/**
 * Applies a recipe as Load recipe does, and for a named take with a sound
 * loads the dry sound made from that recipe, so Capture take carries a WAV.
 */
export async function applyRecipe(
  s: Pick<BuilderSession, "api" | "loadAudio">,
  recipe: Recipe,
  take?: NamedTake,
) {
  const api = s.api.current;
  if (!api) throw new Error("The scene is still starting.");
  const applied = await api.configure(recipe);
  if (take?.sound)
    await s.loadAudio(
      takeSoundWav(applied),
      "take",
      `${take.name} · dry sound`,
    );
  return api.getRecipe();
}

/** The person's pick in the Scene menu. */
export function applyNamedTake(
  s: Pick<BuilderSession, "api" | "loadAudio">,
  id: string,
) {
  const take = findNamedTake(id);
  if (!take) throw new Error("Unknown take.");
  return applyRecipe(s, take.recipe(), take);
}
