// Revision-scoped choices for a saved copy or an agent edit.
import type { Bundle } from "./bundle";
import type { CopyConflict } from "./copy-conflict";
import type { Synced } from "./project-copy-sync-options";

export type CopyKind = "agent" | "saved-copy";

/** Why a first push opened the server's copy instead of pushing over it. */
export const SAVED_COPY = "This project already had a saved copy";

interface CopyChoiceInput {
  id: string;
  revision: number;
  kind: CopyKind;
  overwrittenAt: number;
  current: () => Bundle | undefined;
  synced: () => Synced | undefined;
  /** This project's latest unsettled replacement, if any. */
  latest: () => number | undefined;
  accept: () => void;
  notice: (text: string) => void;
  /** Asks again on the newer revision now open. */
  reoffer: () => void;
  /** Commits the person's earlier draft and pushes it. */
  restore: () => void;
}

export function copyChoice(input: CopyChoiceInput): CopyConflict {
  const { id, revision, kind, overwrittenAt } = input;
  return {
    projectId: id,
    revision,
    kind,
    keepTheirs: () => {
      const current = input.current()?.project;
      const synced = input.synced();
      // Settle only this project, and only the replacement this choice was
      // for: never after a newer replacement or an edit made since.
      if (
        current?.id === id &&
        current.revision === synced?.local &&
        synced?.server === revision &&
        input.latest() === overwrittenAt
      )
        input.accept();
    },
    keepMine: () => {
      const current = input.current()?.project;
      const synced = input.synced();
      if (current?.id !== id) return;
      // Never put an older draft over edits made after the choice appeared.
      if (synced?.local !== current.revision)
        return input.notice(
          "Project changed; review before restoring an older draft.",
        );
      if (synced?.server !== revision) return input.reoffer();
      input.restore();
    },
  };
}
