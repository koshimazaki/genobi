import { useEffect, useState, useSyncExternalStore } from "react";
import spinners, { type SpinnerName } from "cli-spinners";

/**
 * Terminal spinners from cli-spinners (Sindre Sorhus, MIT): each is a list of
 * frames and an interval. Every spinner on the page runs from one
 * requestAnimationFrame loop, started by the first and stopped by the last,
 * and each shows the frame its own interval puts at the current time. With
 * reduced motion the frame holds still.
 */
export type { SpinnerName };

const listeners = new Set<() => void>();
let now = 0;
let raf = 0;
const tick = (t: number) => {
  now = t;
  for (const listener of listeners) listener();
  raf = requestAnimationFrame(tick);
};
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) raf = requestAnimationFrame(tick);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) cancelAnimationFrame(raf);
  };
}

/** The frame `name` shows at `time` milliseconds. */
export function spinnerFrame(name: SpinnerName, time: number): string {
  const { frames, interval } = spinners[name];
  return frames[Math.floor(Math.max(0, time) / interval) % frames.length];
}

const still = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Milliseconds on the shared animation clock while `on` and motion is not
 * reduced; 0 otherwise, so a frame drawn from it holds still.
 */
export function useAnimationTime(on = true): number {
  const [reduced, setReduced] = useState(still);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const moving = on && !reduced;
  const time = useSyncExternalStore(
    moving ? subscribe : noop,
    () => (moving ? now : 0),
    () => 0,
  );
  return time;
}
const noop = () => () => {};

/** The current frame of `name`, or its first frame when motion is reduced or `on` is false. */
export function useSpinnerFrame(name: SpinnerName, on = true): string {
  return spinnerFrame(name, useAnimationTime(on));
}

export { brailleBar } from "../shared/progress-line";
