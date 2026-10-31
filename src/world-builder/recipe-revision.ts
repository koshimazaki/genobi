import { RECIPE_REVISION_CONFLICT } from "../../shared/world-recipe-revision";
import type { RecipeGuard } from "./scene-adapter";

/** New for each mounted runtime; Undo/load never rewinds this live counter. */
export function createRecipeRevision() {
  const scene = crypto.randomUUID();
  let edit = 0;
  const read = () => `${scene}:${edit}`;
  return {
    read,
    advance: () => edit++,
    assert(guard?: RecipeGuard) {
      guard?.signal?.throwIfAborted();
      if (
        guard?.expectedRevision !== undefined &&
        guard.expectedRevision !== read()
      )
        throw new Error(RECIPE_REVISION_CONFLICT);
    },
  };
}
