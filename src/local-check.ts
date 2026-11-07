import { useEffect, useState } from "react";
import type { LocalCheck } from "./run-mode";

/**
 * The local ComfyUI's detection read (`GET /api/settings/workflows?check=local`:
 * `/object_info` only, nothing submitted), for the run-mode line's detail.
 * Read in the background and never through a setting's lane: the composer
 * does not wait on it, and its catalogue part is ignored (the lane owns that).
 * One answer is shared for a short while, so changing models does not ask
 * ComfyUI again each time.
 */
const FRESH_MS = 20_000;
let cached:
  { at: number; key: string; answer: Promise<LocalCheck | null> } | undefined;

const isCheck = (value: unknown): value is LocalCheck =>
  !!value &&
  typeof value === "object" &&
  typeof (value as LocalCheck).reachable === "boolean" &&
  !!(value as LocalCheck).templates &&
  typeof (value as LocalCheck).templates === "object";

/** `key` identifies the location and live reachability: a change asks again. */
export function readLocalCheck(
  key = "",
  now = Date.now(),
): Promise<LocalCheck | null> {
  if (cached && cached.key === key && now - cached.at < FRESH_MS)
    return cached.answer;
  const answer = fetch("/api/settings/workflows?check=local", {
    cache: "no-store",
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data: unknown) => {
      const local = (data as { local?: unknown } | null)?.local;
      return isCheck(local) ? local : null;
    })
    .catch(() => null);
  cached = { at: now, key, answer };
  return answer;
}

/** Tests only: forgets the shared answer. */
export const resetLocalCheckForTests = () => {
  cached = undefined;
};

/**
 * The latest check while `active` (a local graph is held), read again when
 * `key` (location and live reachability) or `entry` changes; another entry with
 * the same key reuses a fresh answer. Null until an answer comes, and
 * whenever the check could not be made.
 */
export function useLocalCheck(active: boolean, key: string, entry: string) {
  const [result, setResult] = useState<{
    key: string;
    entry: string;
    check: LocalCheck | null;
  } | null>(null);
  useEffect(() => {
    if (!active) {
      setResult(null);
      return;
    }
    let live = true;
    void readLocalCheck(key).then((answer) => {
      if (live) setResult({ key, entry, check: answer });
    });
    return () => {
      live = false;
    };
  }, [active, key, entry]);
  return active && result?.key === key && result.entry === entry
    ? result.check
    : null;
}
