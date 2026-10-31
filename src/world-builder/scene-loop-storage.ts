import {
  createSceneLoopBank,
  validateSceneLoopBank,
  type SceneLoopBank,
} from "./scene-loop";

const KEY = "genobi.world.loop-slots.v1";
const MAX_BYTES = 300_000;

/** The slot bank is independent of the currently loaded asset or preset. */
export function readLoopSlots() {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return { bank: createSceneLoopBank(), notice: "" };
    if (stored.length > MAX_BYTES)
      throw new Error("Saved slots are too large.");
    return { bank: validateSceneLoopBank(JSON.parse(stored)), notice: "" };
  } catch {
    return {
      bank: createSceneLoopBank(),
      notice: "Saved slots could not be restored. You can save new views here.",
    };
  }
}

export function storeLoopSlots(bank: SceneLoopBank) {
  try {
    const json = JSON.stringify(bank);
    if (json.length > MAX_BYTES) return false;
    localStorage.setItem(KEY, json);
    return true;
  } catch {
    return false;
  }
}
