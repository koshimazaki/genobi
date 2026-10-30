import type { ArenaSlot } from "../../shared/arena";
import { isTerminal, type Job } from "../../shared/types";

export const runKey = (arenaId: string, jobId: string) => `${arenaId}/${jobId}`;

/** Different approaches may run together; a stored run must first be resolved. */
export function runnable(slot: ArenaSlot, jobs: Record<string, Job>) {
  if (!slot.run?.entry) return false;
  if (!slot.run.jobId) return true;
  const job = jobs[slot.id];
  return job?.id === slot.run.jobId && isTerminal(job.status);
}

/**
 * A saved run the studio answers 404 for: its record expired, or this
 * session did not submit it. It ends the wait, so the approach can run
 * again (with a new key) instead of checking forever.
 */
export const unavailableRun = (id: string): Job =>
  ({
    id,
    status: "Error",
    error:
      "This run can no longer be read here; it may have expired. Run again for a new one.",
  }) as Job;
