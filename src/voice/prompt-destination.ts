import type { VoiceDestination } from "./destination-store";
import { promptById, promptScope, promptTarget } from "./prompt-target";
import { WORLD_PROMPT_ID, worldPromptOpen } from "./world-prompt-target";

/** An absent field holds a note recorded without an editable prompt. */
export interface PromptDestination {
  field?: string;
  scope?: string;
}

/** Capture the field and Scroll item before asynchronous transcription. */
export function capturePromptDestination(
  destination: VoiceDestination,
): PromptDestination | undefined {
  if (destination !== "prompt" && !destination.startsWith("prompt:"))
    return undefined;
  const id = destination === "prompt" ? undefined : destination.slice(7);
  const field = id ? promptById(id) : promptTarget();
  if (field) return { field: field.id, scope: promptScope(field) };
  if ((!id || id === WORLD_PROMPT_ID) && worldPromptOpen())
    return { field: WORLD_PROMPT_ID };
  return {};
}
