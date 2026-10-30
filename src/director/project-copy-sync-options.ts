// The options a project copy sync (project-copy-sync.ts) is built with, and
// the per-project record it keeps of what the server holds.
import type { createStudioStore } from "../studio/store";
import type { CopyConflict } from "./copy-conflict";
import type { BundleUpgrade } from "./upgrade-bundle";
import type { Bundle } from "./bundle";

export type Store = ReturnType<typeof createStudioStore>;
export interface SyncOptions {
  store: Store;
  /** One line for the person, shown in the Director's notice row. */
  notice: (text: string) => void;
  /** The copy of this project exists on the server: open its stream. */
  live: (id: string) => void;
  fetcher?: typeof fetch;
  /** Milliseconds between an edit and its push; 600 unless a test sets it. */
  debounce?: number;
  /**
   * A push met `revision_conflict` and the agent's revision replaced the
   * person's edits in the store: ask before putting theirs back over it.
   */
  conflict?: (question: CopyConflict) => void;
  /**
   * Bring a copy saved by an older studio up to date as it opens
   * (upgrade-bundle.ts); undefined when it needs nothing.
   */
  upgrade?: (bundle: Bundle) => Promise<BundleUpgrade | undefined>;
}
/** The server revision whose content the store held at a local revision. */
export interface Synced {
  server: number;
  local: number;
}
