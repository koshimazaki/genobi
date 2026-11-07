import { useEffect, useRef } from "react";
import type { Activity } from "../busy";
import { isMediaActivity, parseActivityLine } from "../director/media-progress";
import { loadSoundChoice } from "./choice";
import { LOAD_SOUNDS } from "./cues";
import { LoadSoundPlayer } from "./player";

/**
 * A load must still be showing this long before its start cue plays, so a
 * quick load stays silent and never chirps twice in a row.
 */
export const START_DELAY_MS = 600;

/**
 * True while the header loader shows real work: a template media load, or
 * an activity that reports a percent. The walkers game (background play)
 * never sounds.
 */
export function loadSoundActive(activity: Activity[]) {
  return activity.some(
    (a) =>
      isMediaActivity(a.id) ||
      (!a.background && parseActivityLine(a.line).percent !== undefined),
  );
}

const shared = new LoadSoundPlayer();

/**
 * Plays the chosen start cue once a load has shown for `START_DELAY_MS`, and
 * the done cue when that load ends. A load that ends sooner makes no sound.
 */
export function useLoadSound(
  active: boolean,
  player: LoadSoundPlayer = shared,
) {
  const started = useRef(false);
  useEffect(() => {
    const play = (part: "start" | "done") => {
      const choice = loadSoundChoice();
      if (choice !== "off") player.play(LOAD_SOUNDS[choice][part]);
    };
    if (!active) {
      if (started.current) {
        started.current = false;
        play("done");
      }
      return;
    }
    const timer = setTimeout(() => {
      started.current = true;
      play("start");
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active, player]);
}
