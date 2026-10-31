import { validateRecipe, type Recipe } from "./recipe";
import {
  captureLoopSnapshot,
  loopAudioData,
  validateLoopSnapshot,
} from "./scene-loop-snapshot";
import {
  SCENE_LOOP_SLOTS,
  type SceneLoopAudio,
  type SceneLoopBank,
  type SceneLoopCaptureOptions,
  type SceneLoopSlot,
} from "./scene-loop-types";

export function createSceneLoopBank(): SceneLoopBank {
  return { version: 1, slots: [null, null, null, null] };
}

export function validateSceneLoopBank(input: unknown): SceneLoopBank {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["version", "slots"].includes(key))
  )
    throw new Error("Invalid scene-loop bank.");
  const bank = input as SceneLoopBank;
  if (
    bank.version !== 1 ||
    !Array.isArray(bank.slots) ||
    bank.slots.length !== 4 ||
    JSON.stringify(input).length > 260_000
  )
    throw new Error("A scene-loop bank contains four bounded slots, A–D.");
  return {
    version: 1,
    slots: bank.slots.map((slot) =>
      slot === null ? null : validateLoopSnapshot(slot),
    ) as SceneLoopBank["slots"],
  };
}

function slotIndex(index: number): asserts index is SceneLoopSlot {
  if (!Number.isInteger(index) || index < 0 || index > 3)
    throw new Error("Choose loop slot A, B, C or D.");
}

export function saveSceneLoopSlot(
  input: SceneLoopBank,
  index: SceneLoopSlot,
  recipe: Recipe,
  frame: number,
  options: SceneLoopCaptureOptions = {},
): SceneLoopBank {
  slotIndex(index);
  const bank = validateSceneLoopBank(input);
  bank.slots[index] = captureLoopSnapshot(recipe, frame, {
    ...options,
    label: options.label ?? `State ${SCENE_LOOP_SLOTS[index]}`,
  });
  return bank;
}

export function removeSceneLoopSlot(
  input: SceneLoopBank,
  index: SceneLoopSlot,
): SceneLoopBank {
  slotIndex(index);
  const bank = validateSceneLoopBank(input);
  bank.slots[index] = null;
  return bank;
}

/** Recall a saved arrangement at frame zero, keeping only the current soundtrack. */
export function sceneLoopSlotRecipe(
  input: SceneLoopBank,
  index: SceneLoopSlot,
  audio?: SceneLoopAudio,
): Recipe {
  slotIndex(index);
  const slot = validateSceneLoopBank(input).slots[index];
  if (!slot)
    throw new Error(
      `Save State ${SCENE_LOOP_SLOTS[index]} before recalling it.`,
    );
  return validateRecipe({ ...slot.recipe, ...loopAudioData(audio) });
}
