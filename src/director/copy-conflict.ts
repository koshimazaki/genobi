/**
 * The question a push conflict asks (Box 1.8, decision 2). The studio pushed
 * the project copy on a revision an agent had already moved on; the server
 * refused (`revision_conflict`), the studio read the agent's revision into
 * the store (the person's version is in Undo), and now asks before it
 * replaces the agent's changes with the person's. The page never reloads.
 */
import { useSyncExternalStore } from "react";

export interface CopyConflict {
  /** A saved project reopened over a draft, or a conflict with an agent. */
  kind?: "saved-copy" | "agent";
  projectId: string;
  /** The agent's revision now open in the studio. */
  revision: number;
  /** Puts the person's version back and pushes it over the agent's. */
  keepMine: () => void;
  /** Acknowledges that the current saved copy is the one to keep. */
  keepTheirs?: () => void;
}

let open: CopyConflict | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Shows the question; a newer conflict replaces an unanswered one. */
export function askCopyConflict(conflict: CopyConflict) {
  open = conflict;
  emit();
}

/** The person's answer: their version back (`true`) or the agent's kept. */
export function answerCopyConflict(keepMine: boolean) {
  const answered = open;
  open = undefined;
  emit();
  if (keepMine) answered?.keepMine();
  else answered?.keepTheirs?.();
}

export const copyConflict = () => open;
export const useCopyConflict = () =>
  useSyncExternalStore(subscribe, copyConflict, copyConflict);
