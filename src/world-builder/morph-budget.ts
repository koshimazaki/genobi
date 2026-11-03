import { validateRecipe, type Recipe } from "./recipe";

/** Keep authored forms usable after a full prepared soundtrack is attached. */
export function validateMorphRecipe(
  input: unknown,
  reserveAudio = true,
): Recipe {
  try {
    const recipe = validateRecipe(input);
    if (reserveAudio) {
      const length = Math.max(241, recipe.frames);
      const signal = Array.from({ length }, (_, i) => {
        const value = (Math.sin(i * 1.711) + 1) / 2;
        return length > 241 ? Math.round(value * 10_000) / 10_000 : value;
      });
      validateRecipe({
        ...recipe,
        envelope: signal,
        bandEnvelopes: { sub: signal, low: signal, mid: signal, high: signal },
      });
    }
    return recipe;
  } catch (error) {
    if (error instanceof Error && error.message.includes("64 KB"))
      throw new Error(
        "Use fewer blocks (64 or 128) or fewer states to leave room for a full soundtrack within 64 KB.",
        { cause: error },
      );
    throw error;
  }
}
