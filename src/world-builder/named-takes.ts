import fall from "../../custom_nodes/director_world_builder/examples/moves/fall.json";
import {
  NAMED_TAKE_IDS,
  type NamedTakeId,
} from "../../shared/scene/named-takes";
import { validateRecipe, type Recipe } from "./recipe";

export { NAMED_TAKE_IDS };

/**
 * A named take: a move-library recipe the person and an agent can pick by
 * id (the Scene menu, `genobi_world_recipe`), with an optional dry sound made
 * from the recipe itself (`take-sound.ts`), so a capture carries a WAV for the
 * room. Nothing here generates a model run.
 */
export interface NamedTake {
  id: NamedTakeId;
  /** The Scene menu's label. */
  name: string;
  description: string;
  /** The move-library file the recipe comes from, for the docs and tests. */
  source: string;
  /** True when choosing it also loads the recipe's synthesised dry sound. */
  sound: boolean;
  recipe(): Recipe;
}

/**
 * The Falling room: the move library's fall take (`examples/moves/fall.json`)
 * as it is, Cathedral, orbit60, idle then hit then fall over 145 frames,
 * with the audio gain at zero, so its dry sound is the take's soundtrack and
 * never moves the room.
 */
const fallingRoom: NamedTake = {
  id: "falling-room",
  name: "Falling room",
  description:
    "The Cathedral, an orbit60 shot, the mannequin idles, is hit and falls: 145 frames, with a dry impact sound.",
  source: "custom_nodes/director_world_builder/examples/moves/fall.json",
  sound: true,
  recipe: () => validateRecipe(structuredClone({ ...fall, audioGain: 0 })),
};

export const NAMED_TAKES: readonly NamedTake[] = [fallingRoom];

export function findNamedTake(id: unknown) {
  return NAMED_TAKES.find((t) => t.id === id);
}

/** The take's recipe, or a refusal naming the takes there are. */
export function namedTakeRecipe(id: unknown): Recipe {
  const take = findNamedTake(id);
  if (!take)
    throw new Error(`Unknown take. Choose ${NAMED_TAKE_IDS.join(" or ")}.`);
  return take.recipe();
}
