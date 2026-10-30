/**
 * The Script's **Use as Director prompt**: the script becomes the open
 * project's main prompt (the project prompt, `prompt-brief.ts`) without
 * opening the Director. It is one ordinary commit, so the Director's undo
 * reverts it, and Undo beside the answer does while nothing else changed.
 * References already in the prompt stay bound; tokens the new text no longer
 * names simply stop being active, as when the person types over them.
 */
import { readBrief, writeBrief } from "../director/prompt-brief";
import type { DirectorEdit } from "../studio/send-to-director";
import { studioStore, type createStudioStore } from "../studio/store";

type Store = ReturnType<typeof createStudioStore>;

export function setDirectorPrompt(
  script: string,
  store: Store = studioStore,
): DirectorEdit {
  const state = store.getState(),
    bundle = state.director.bundle;
  if (!bundle) throw new Error("The project is still opening. Try again.");
  const text = script.trim();
  if (!text) throw new Error("Write the script first.");
  if (Object.values(state.operations).some(Boolean))
    throw new Error("Wait for the current edit or render to finish.");
  const brief = readBrief(bundle);
  if (brief.text === text) return { message: "Already the Director's prompt." };
  state.actions.commit(writeBrief(bundle, { ...brief, text }), bundle);
  return {
    message: "Set as the Director's prompt.",
    after: store.getState().director.bundle,
  };
}
