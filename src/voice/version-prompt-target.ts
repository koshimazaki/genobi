/**
 * Make my version's "With what?" sentence as a voice destination (owner,
 * 4 November 2026: "you speak to the agent what you want to do"). It is one
 * of the prompts `prompt-target.ts` fills while it is on screen; a fill marks
 * the field (`data-dictated`) so the panel starts its session as `voice`.
 */
export const VERSION_PROMPT_ID = "version-with-what";
export const VERSION_PROMPT_LABEL = "Version · with what";

/** Reads and clears the dictation mark a voice fill left on the field. */
export function takeDictated(field: HTMLElement) {
  const dictated = field.dataset.dictated === "true";
  delete field.dataset.dictated;
  return dictated;
}
