// Revision-scoped choices for a saved copy or an agent edit.
import type { Bundle } from "./bundle";
import type { CopyConflict } from "./copy-conflict";
import type { Synced } from "./project-copy-sync-options";

interface CopyChoiceInput {
  id: string;
  revision: number;
  kind: "agent" | "saved-copy";
  overwrittenAt: number;
  current: () => Bundle | undefined;
  synced: () => Synced | undefined;
  counters: () => { overwritten: number; keptAt: number };
  accept: () => void;
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
      const { overwritten, keptAt } = input.counters();
      // Never clear an earlier unacknowledged revision or accept after a new edit.
      if (
        current?.id === id &&
        current.revision === synced?.local &&
        synced.server === revision &&
        overwritten === overwrittenAt &&
        keptAt === overwrittenAt - 1
      )
        input.accept();
    },
    keepMine: input.restore,
  };
}
