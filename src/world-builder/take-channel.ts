import { useCallback, useRef, useState } from "react";
import type { Take } from "./export-take";

type TakeListener = (take: Take) => void;

/**
 * Tells listeners about a finished take at the moment it is produced, not
 * when React next renders. A capture followed at once by a configure sets the
 * take and then clears it in the same batch, so an effect watching the
 * session's take would never see it; a listener here always does.
 */
export function takeChannel() {
  const listeners = new Set<TakeListener>();
  return {
    publish(take: Take) {
      for (const listener of [...listeners]) listener(take);
    },
    /** Listen for finished takes; returns the unsubscribe. */
    subscribe(listener: TakeListener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * The session's take as state, plus `onTake` for whoever must keep every
 * take. Setting a take publishes it before React batches the state, so the
 * capture, Capture take and record-stop paths all reach listeners.
 */
export function useTakeChannel() {
  const [take, setState] = useState<Take | null>(null);
  const channel = useRef(takeChannel());
  const setTake = useCallback((next: Take | null) => {
    setState(next);
    if (next) channel.current.publish(next);
  }, []);
  return [take, setTake, channel.current.subscribe] as const;
}

/**
 * Wraps `keep` so each take is kept once, however many times it is
 * published: a take is its object, so the same capture is never added twice.
 */
export function keepOnce<T>(keep: (take: Take) => T) {
  const seen = new WeakSet<Take>();
  return (take: Take): T | undefined => {
    if (seen.has(take)) return undefined;
    seen.add(take);
    return keep(take);
  };
}
