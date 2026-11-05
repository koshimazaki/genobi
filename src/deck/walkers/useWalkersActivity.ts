import { useEffect } from "react";
import { setBackgroundActivity } from "../../busy";

/** The walkers game's entry in the studio's activity list. */
export const WALKERS_ACTIVITY = "walkers-game";

/**
 * Shows the game's status on the studio's activity line (the wordmark's
 * loader and the deck bar) while the game is open, at the lowest priority:
 * any real job or agent line outranks it (`setBackgroundActivity`). Cleared
 * on unmount, which is every way out: Esc, EXIT, the deck bar, a win or a
 * failure followed by leaving.
 */
export function useWalkersActivity(line: string) {
  useEffect(() => {
    setBackgroundActivity(WALKERS_ACTIVITY, line);
  }, [line]);
  useEffect(() => () => setBackgroundActivity(WALKERS_ACTIVITY, undefined), []);
}
