/**
 * Each mechanical template's latest submission: its idempotency key, the
 * quote it spent, how far it got and its job. Kept in memory and in this
 * tab's sessionStorage, so a reload mid-run still knows a run may have
 * started and asks the person to check Camera history before offering a
 * clean Generate. Never the page key or any credential; every storage access
 * is guarded, since storage can be missing or refuse.
 */
import { QUOTE_ID } from "../../shared/quote";

export interface PendingRun {
  templateId: string;
  idempotency: string;
  quoteId: string;
  state: "submitting" | "started" | "uncertain";
  jobId?: string;
  /** Read back after a reload, not recorded by this page. */
  restored?: true;
}

const PREFIX = "genobi.gallery.run.";
const STATES = ["submitting", "started", "uncertain"];
const ID = /^[A-Za-z0-9_-]{1,80}$/;

/** A stored record, or undefined when it is not one this page would write. */
export function readStored(
  templateId: string,
  raw: string | null,
): PendingRun | undefined {
  if (!raw || raw.length > 1000) return undefined;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof v.key !== "string" ||
      !QUOTE_ID.test(v.key) ||
      typeof v.quoteId !== "string" ||
      !QUOTE_ID.test(v.quoteId) ||
      !STATES.includes(v.state as string) ||
      (v.jobId !== undefined &&
        (typeof v.jobId !== "string" || !ID.test(v.jobId)))
    )
      return undefined;
    return {
      templateId,
      idempotency: v.key,
      quoteId: v.quoteId,
      state: v.state as PendingRun["state"],
      ...(v.jobId ? { jobId: v.jobId as string } : {}),
      restored: true,
    };
  } catch {
    return undefined;
  }
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const sessionStore = (): Store | undefined => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};

export function createPendingRuns(
  storage: () => Store | undefined = sessionStore,
) {
  const runs = new Map<string, PendingRun | null>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  return {
    get(templateId: string) {
      if (!runs.has(templateId)) {
        let raw: string | null = null;
        try {
          raw = storage()?.getItem(PREFIX + templateId) ?? null;
        } catch {
          // Unreadable storage: nothing to restore.
        }
        runs.set(templateId, readStored(templateId, raw) ?? null);
      }
      return runs.get(templateId) ?? undefined;
    },
    record(run: PendingRun) {
      runs.set(run.templateId, run);
      try {
        storage()?.setItem(
          PREFIX + run.templateId,
          JSON.stringify({
            key: run.idempotency,
            quoteId: run.quoteId,
            state: run.state,
            ...(run.jobId ? { jobId: run.jobId } : {}),
          }),
        );
      } catch {
        // Kept in memory for this page only.
      }
      notify();
    },
    /** The person checked Camera history and wants a new run. */
    clear(templateId: string) {
      runs.set(templateId, null);
      try {
        storage()?.removeItem(PREFIX + templateId);
      } catch {
        // Nothing stored to remove.
      }
      notify();
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

export const pendingRuns = createPendingRuns();

/**
 * Whether a reloaded record still needs the person's check: it was restored
 * and its job is not (yet) in Camera's list, or it never got a job.
 */
export const needsCheck = (run: PendingRun | undefined, jobFound: boolean) =>
  !!run?.restored && (!run.jobId || !jobFound);

export const CHECK_HISTORY = "A run may be in progress; see Camera history.";
