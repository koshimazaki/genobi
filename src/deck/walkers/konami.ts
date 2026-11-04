import { useCallback, useEffect, useState } from "react";
import { isTypingTarget } from "../../keyboard";
import { ChipAudio, rememberedMute } from "./chip-audio";

/** ↑ ↑ ↓ ↓ ← → ← → B A, as `KeyboardEvent.key` values. */
export const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;

/**
 * Add one key to the recent keys; `matched` when they now end with the whole
 * sequence. Letters match either case. Pure, so the hook's state is a list.
 */
export function pushKey(
  recent: readonly string[],
  key: string,
): { recent: string[]; matched: boolean } {
  const k = key.length === 1 ? key.toLowerCase() : key;
  const next = [...recent, k].slice(-KONAMI.length);
  const matched =
    next.length === KONAMI.length && next.every((v, i) => v === KONAMI[i]);
  return { recent: matched ? [] : next, matched };
}

/** Whether focus is in a dialog (a modal keeps its own keys). */
export const inDialog = (target: EventTarget | null) =>
  typeof Element !== "undefined" &&
  target instanceof Element &&
  !!target.closest("dialog");

/** Whether a key press may count toward the code: never in a text field or dialog. */
export function countsTowardCode(event: {
  target: EventTarget | null;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}) {
  return (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !isTypingTarget(event.target) &&
    !inDialog(event.target)
  );
}

/**
 * Listens for the code anywhere in the studio except in text fields, and
 * opens the walkers game. The game's audio is woken inside the key press
 * itself, the user gesture browsers ask for. `exit` returns focus to where
 * it was, and the deck to the state it was left in, which it never changed.
 */
export function useWalkers() {
  const [on, setOn] = useState(false);
  const [audio] = useState(() => new ChipAudio());
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (on) return;
    let recent: string[] = [];
    const down = (event: KeyboardEvent) => {
      if (!countsTowardCode(event)) {
        recent = [];
        return;
      }
      const next = pushKey(recent, event.key);
      recent = next.recent;
      if (!next.matched) return;
      if (!rememberedMute()) audio.start();
      setReturnTo(
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      );
      setOn(true);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [on, audio]);
  useEffect(() => () => audio.stop(), [audio]);
  const exit = useCallback(() => {
    audio.stop();
    setOn(false);
    if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
  }, [audio, returnTo]);
  return { on, exit, audio };
}
