import { useEffect, useRef, useState } from "react";

/** Milliseconds per simulation tick: about six creature steps a second. */
export const TICK_MS = 170;

const reducedQuery = () =>
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : undefined;

/** True while the person asks for reduced motion; follows changes. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => !!reducedQuery()?.matches);
  useEffect(() => {
    const query = reducedQuery();
    if (!query) return;
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

/** Calls `onHidden` whenever the tab is hidden. */
export function useOnHidden(onHidden: () => void) {
  const latest = useRef(onHidden);
  useEffect(() => {
    latest.current = onHidden;
  });
  useEffect(() => {
    const change = () => {
      if (document.hidden) latest.current();
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
}

/**
 * A fixed-step clock: while `running`, calls `onTick` once per `TICK_MS` of
 * animation-frame time, catching up at most a few ticks after a slow frame
 * so the simulation never depends on the frame rate.
 */
export function useFixedStep(running: boolean, onTick: () => void) {
  const latest = useRef(onTick);
  useEffect(() => {
    latest.current = onTick;
  });
  useEffect(() => {
    if (!running || typeof requestAnimationFrame !== "function") return;
    let raf = 0,
      last: number | undefined,
      carry = 0;
    const frame = (now: number) => {
      if (last !== undefined) {
        carry = Math.min(carry + now - last, TICK_MS * 4);
        while (carry >= TICK_MS) {
          carry -= TICK_MS;
          latest.current();
        }
      }
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}
