import { CREATURE_SHA256 } from "../../shared/scene/creature-reference";
import { creatureMotionReceipt } from "../scene3d/creature-fbx";
import { localCreature } from "../scene3d/creature";
import { inComfyNode } from "./host";
import { presetRecipe, presets, type Recipe } from "./recipe";

/** The shader set: the current set drawn by the Neuro sky shader. */
export const SHADER_PRESET = "Neuro shader";

/**
 * Presets the Comfy node's menu leaves out. The Neuro shader is a full-frame
 * sky with no set, character or depth to carry into a graph, so it has
 * nothing to promote into a Comfy take; it stays in the studio (MIT, from
 * Holodeck; `Holodeck-LICENSE.txt`).
 */
export const COMFY_HIDDEN_PRESETS: readonly string[] = [SHADER_PRESET];

/** The Load preset menu's set names, in order, for where this runs. */
export function presetMenu(comfy = inComfyNode()) {
  return [...Object.keys(presets), SHADER_PRESET].filter(
    (name) => !comfy || !COMFY_HIDDEN_PRESETS.includes(name),
  );
}

/**
 * A preset's recipe as the menu loads it. A preset that names the creature
 * gets it with its receipt when the creature file is attached under Scene,
 * and the neutral mannequin when it is not, so a preset always loads.
 */
export function menuPreset(
  name: string,
  creatureLoaded = !!localCreature(),
): Recipe {
  const recipe = presetRecipe(name);
  if (recipe.avatarAsset !== "creature") return recipe;
  return creatureLoaded
    ? {
        ...recipe,
        creatureReference: {
          sha256: CREATURE_SHA256,
          motions: creatureMotionReceipt(),
        },
      }
    : { ...recipe, avatarAsset: "mannequin", creatureReference: null };
}
