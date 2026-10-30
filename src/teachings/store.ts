import { useSyncExternalStore } from "react";
import { nextTeaching, type Teaching } from "../../shared/teachings";

/**
 * The teaching every surface shows, one at a time for the whole page: the
 * deck's bar, the idle bubble and setup read the same one, so stepping it in
 * one place steps it everywhere. The seen list stays in this browser only, a
 * per-viewer convenience never sent anywhere; any storage failure (a private
 * window, blocked site data) falls back to the default order.
 */
export const TEACHINGS_KEY = "genobi.teachings";

function storedSeen(): string[] {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(TEACHINGS_KEY) ?? "[]",
    );
    return Array.isArray(saved)
      ? saved.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function keep(seen: readonly string[]) {
  try {
    localStorage.setItem(TEACHINGS_KEY, JSON.stringify(seen));
  } catch {
    /* Private windows keep the default order. */
  }
}

let current: Teaching | undefined;
// Held in memory too, so stepping still moves on when storage is refused.
let seen: string[] = [];
const listeners = new Set<() => void>();

function advance(from: readonly string[]) {
  const next = nextTeaching(from, Math.random);
  seen = next.seen;
  current = next.teaching;
  keep(seen);
  return next.teaching;
}

/** The teaching showing now; the first read picks the next unseen one. */
export function teachingNow(): Teaching {
  return current ?? advance(storedSeen());
}

/** Steps to the following teaching, on every surface at once. */
export function stepTeaching() {
  teachingNow();
  advance(seen);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTeaching(): Teaching {
  return useSyncExternalStore(subscribe, teachingNow, teachingNow);
}

/** Tests only: forget the page's teaching so the next read starts again. */
export function resetTeaching() {
  current = undefined;
  seen = [];
}
