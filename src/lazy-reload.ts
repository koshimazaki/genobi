import { lazy, type ComponentType } from "react";
import { reloadAfterSaving } from "./director/leave-guard";

const KEY = "genobi:chunk-reload";
/** Reloads at most once in this window, so a chunk that is really gone cannot loop. */
const WINDOW_MS = 30_000;

/**
 * Whether a failed dynamic import is a stale chunk: an open tab asking for
 * a file the server no longer has. In development that is Vite answering
 * 504 "Outdated Optimize Dep" after it re-optimised dependencies or the
 * server restarted on new code; in production it is a deploy that replaced
 * the hashed chunks. Both say "Failed to fetch dynamically imported module"
 * (Chromium), "error loading dynamically imported module" (Firefox) or
 * "Importing a module script failed" (Safari).
 */
export const isStaleChunk = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|Outdated Optimize Dep/i.test(
    String((error as Error)?.message ?? error),
  );

/**
 * Reloads the page once to fetch the current files, after the Director's
 * project copy saved what is waiting (`reloadAfterSaving`), so a saved copy
 * reloads without the browser's leave-page dialog. Answers false when a
 * reload already happened in the last 30 seconds, so the error shows instead.
 */
export function reloadForStaleChunk(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = safeSession(),
  reload = () => void reloadAfterSaving(),
  now = Date.now(),
) {
  // Without storage the guard cannot hold, so never risk a loop.
  if (!storage) return false;
  try {
    if (now - Number(storage.getItem(KEY) ?? 0) < WINDOW_MS) return false;
    storage.setItem(KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

function safeSession() {
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * `React.lazy` that recovers from a stale chunk by reloading once, instead of
 * leaving the view broken with "Failed to fetch dynamically imported module".
 */
// The same bound React.lazy uses, so props stay typed at each call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyReload<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    load().catch((error: unknown) => {
      if (isStaleChunk(error) && reloadForStaleChunk())
        return new Promise<never>(() => {});
      throw error;
    }),
  );
}
