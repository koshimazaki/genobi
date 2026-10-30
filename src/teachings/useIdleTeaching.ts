import { useEffect, useState } from "react";
import { teachingHold, type Teaching } from "../../shared/teachings";
import { DECK_READY } from "../deck/deck-now";
import { stepTeaching, useTeaching } from "./store";

/**
 * The deck's idle rotation: once the bar has nothing real to say, it reads
 * the ready line for its hold, then shows teachings one after another, each
 * for a reading pace. Anything real ends the spell at once, and the next idle
 * spell starts from the ready line again. The deck is the only surface that
 * steps on a timer; the bubble and setup show the same teaching and step it
 * with Next. Reduced motion changes nothing here: the text swaps without a
 * transition anywhere.
 */
export function useIdleTeaching(idle: boolean): Teaching | undefined {
  const teaching = useTeaching();
  const [wasIdle, setWasIdle] = useState(idle);
  const [showing, setShowing] = useState(false);
  if (idle !== wasIdle) {
    setWasIdle(idle);
    if (!idle) setShowing(false);
  }
  useEffect(() => {
    if (!idle || showing) return;
    const timer = setTimeout(() => setShowing(true), teachingHold(DECK_READY));
    return () => clearTimeout(timer);
  }, [idle, showing]);
  useEffect(() => {
    if (!idle || !showing) return;
    const timer = setTimeout(stepTeaching, teachingHold(teaching.text));
    return () => clearTimeout(timer);
  }, [idle, showing, teaching]);
  return idle && showing ? teaching : undefined;
}
