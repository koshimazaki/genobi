import type { Take } from "./export-take";
import { validateRecipe, type Recipe } from "./recipe";

/** A saved take carries its own recipe, independent of the open scene. */
export async function takeRecipe(
  take: Pick<Take, "manifest">,
): Promise<Recipe> {
  try {
    const receipt: unknown = JSON.parse(await take.manifest.text());
    if (!receipt || typeof receipt !== "object" || !("recipe" in receipt))
      throw new Error("Missing recipe");
    return validateRecipe(receipt.recipe);
  } catch {
    throw new Error(
      "This take has no valid recipe receipt. Download it, or capture a new take before sending it to a project.",
    );
  }
}
