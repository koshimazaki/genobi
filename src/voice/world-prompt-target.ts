import { useEffect, useRef } from "react";

/**
 * World Builder's scene direction as a voice destination (issues #18, #23).
 * Its textarea is one of the prompts `prompt-target.ts` fills while it is on
 * screen; this registration is how the words still reach it while World
 * Builder is open with its Scene panel closed. World Builder registers its
 * session's `change`, so a dictated direction is an ordinary edit of the
 * recipe's `prompt`: nothing is captured, rendered or spent.
 */
export const WORLD_PROMPT_ID = "world-prompt";
export const WORLD_PROMPT_LABEL = "World Builder scene direction";
/** As `validateRecipe` bounds the recipe's prompt. */
export const WORLD_PROMPT_MAX = 4000;

type Target = (prompt: string) => void;
let target: Target | undefined;

/** Registers a target; returns the cleanup. The newest registration wins. */
export function onWorldPrompt(next: Target) {
  target = next;
  return () => {
    if (target === next) target = undefined;
  };
}

/** World Builder is open and takes a scene direction. */
export const worldPromptOpen = () => !!target;

/** Writes the direction within the recipe's limit; false when none is open. */
export function fillWorldPrompt(text: string) {
  if (!target) return false;
  target(text.slice(0, WORLD_PROMPT_MAX));
  return true;
}

/**
 * Called by World Builder: while it is on screen (`active`) its session's
 * `change` is the target.
 */
export function useWorldPromptTarget(
  change: (patch: { prompt: string }) => void,
  active: boolean,
) {
  const latest = useRef(change);
  useEffect(() => {
    latest.current = change;
  });
  useEffect(() => {
    if (!active) return;
    return onWorldPrompt((prompt) => latest.current({ prompt }));
  }, [active]);
}
