import type { Recipe } from "../../src/world-builder/recipe";
import { pyramidInside, type RoomDesign } from "./recipes-rooms";

/**
 * The pyramid interior as the party room: the same terraces and camera, the
 * figure dancing on the floor. The owner's alternative to the hall for the
 * drop: "people dancing inside the pyramid".
 */
export function pyramidInsideParty(recipe: Recipe): RoomDesign {
  const built = pyramidInside(recipe);
  recipe.avatarMotion = "dance";
  recipe.prompt =
    "From the floor of a vast stepped stone pyramid, a wide view up the towering terraces to the open apex, a crowd dancing on the floor. The terraced walls close in on the loud beats and open in the quiet. Warm sandstone, a shaft of daylight from the oculus, dust in the air.";
  return {
    ...built,
    design: { ...built.design, avatar: "mannequin, dance, on the floor" },
  };
}
