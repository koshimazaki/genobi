import type { Job } from "../../shared/types";

/**
 * A run the person approved in the agent panel (issue #23, "Confirm before
 * spending") joins the gallery's job list and its one polling loop. The
 * approve answer carries the job, which goes straight in; a run found only
 * by a recovery read carries its id, and the read-only handoff is tried
 * again until it lands. Nothing here ever submits. In memory only.
 */
export interface ApprovedJob {
  id: string;
  /** The job as the approve answer returned it, when there was one. */
  job?: Job;
}
type Listener = (approved: ApprovedJob) => void;
const listeners = new Set<Listener>();

export function announceApprovedJob(approved: ApprovedJob) {
  for (const listener of listeners) listener(approved);
}

/** Subscribes; returns the unsubscribe. */
export function onApprovedJob(listener: Listener) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** 1, 2, 4, 8 and then 15 seconds between read-only tries. */
export const backoff = (attempt: number) =>
  Math.min(15_000, 1000 * 2 ** attempt);

/** Failed reads after which a pending run is shown as stuck, about 5 min. */
export const STUCK_AFTER = 24;

/**
 * Runs still to be handed to the gallery, for the page's lifetime: never
 * dropped. Each is read again with capped backoff, and at once when the
 * connection returns (`online`), after a history load that succeeded, or
 * when the person asks (`retryPendingHandoffs`).
 */
const pending = new Map<string, number>();
const watchers = new Set<() => void>();
let stuck: string[] = [];
let nudge: () => void = () => {};
let nudged = new Promise<void>((resolve) => (nudge = resolve));
const changed = () => {
  const next = [...pending]
    .filter(([, n]) => n >= STUCK_AFTER)
    .map(([id]) => id);
  if (next.join() !== stuck.join()) stuck = next;
  watchers.forEach((watch) => watch());
};

/** Retries every pending handoff now. */
export function retryPendingHandoffs() {
  const wake = nudge;
  nudged = new Promise<void>((resolve) => (nudge = resolve));
  wake();
}
if (typeof window !== "undefined")
  window.addEventListener("online", retryPendingHandoffs);

/** A capped wait that a retry cuts short. */
const sleep = (ms: number) =>
  Promise.race([
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
    nudged,
  ]);

/** Paid runs not yet in the gallery after many tries: shown, never hidden. */
export const stuckHandoffs = () => stuck;
export function onHandoffsChanged(watch: () => void) {
  watchers.add(watch);
  return () => void watchers.delete(watch);
}

/**
 * Puts an approved run in the list: the returned job at once, or by its own
 * read (`track`, which answers false when the read failed), tried again with
 * capped backoff until it lands. Resolves true once it is in; it never gives
 * up while the page is open.
 */
export async function handOffApprovedJob(
  approved: ApprovedJob,
  {
    add,
    track,
    wait = sleep,
  }: {
    add: (job: Job) => void;
    track: (id: string) => Promise<boolean>;
    wait?: (ms: number) => Promise<void>;
  },
) {
  if (approved.job) {
    add(approved.job);
    return true;
  }
  if (pending.has(approved.id)) return false; // already being handed over
  pending.set(approved.id, 0);
  changed();
  for (let attempt = 0; ; attempt++) {
    if (await track(approved.id)) {
      pending.delete(approved.id);
      changed();
      return true;
    }
    pending.set(approved.id, attempt + 1);
    changed();
    await wait(backoff(attempt));
  }
}

/** Tests start from nothing. */
export function resetHandoffsForTests() {
  pending.clear();
  changed();
}
