import type { Arena } from "../../shared/arena";
import { isTerminal, type Job } from "../../shared/types";
import { unavailableRun } from "./run-state";

type State = { arena?: Arena; dirty: boolean; busy: boolean };
interface Options {
  current: () => State;
  hidden: () => boolean;
  known: (arenaId: string, jobId: string) => Job | undefined;
  read: (jobId: string) => Promise<Job>;
  record: (arenaId: string, job: Job) => void;
  attach: (arenaId: string, slotId: string, jobId: string) => Promise<Arena>;
  adopt: (arena: Arena) => void;
}

/** One in-flight tick; stale reads cannot update another comparison or run. */
export function pollArenaRuns(o: Options) {
  let stopped = false,
    inFlight = false;
  const matches = (id: string, slot: string, job: string) =>
    !stopped &&
    o.current().arena?.id === id &&
    o.current().arena?.slots.find((s) => s.id === slot)?.run?.jobId === job;
  async function tick() {
    const arena = o.current().arena;
    if (stopped || inFlight || !arena || o.hidden()) return;
    inFlight = true;
    try {
      for (const slot of arena.slots) {
        const jobId = slot.run?.jobId;
        if (!jobId) continue;
        const known = o.known(arena.id, jobId);
        // Resolve even a persisted ready slot once after reload, so Run again
        // is enabled only by the status of its own job, not another slot's.
        if (
          known &&
          isTerminal(known.status) &&
          (known.status !== "Ready" || slot.status === "ready")
        )
          continue;
        try {
          const job = await o.read(jobId);
          if (!matches(arena.id, slot.id, jobId) || job.id !== jobId) return;
          o.record(arena.id, job);
          if (
            job.status === "Ready" &&
            o.current().arena?.slots.find((s) => s.id === slot.id)?.status !==
              "ready" &&
            !o.current().dirty &&
            !o.current().busy
          ) {
            const result = await o.attach(arena.id, slot.id, jobId);
            const latest = o.current();
            if (
              matches(arena.id, slot.id, jobId) &&
              !latest.dirty &&
              !latest.busy &&
              result.id === arena.id &&
              result.revision >= latest.arena!.revision
            )
              o.adopt(result);
          }
        } catch (error) {
          // A definite 404 settles the wait; anything else is read again.
          // Only reads/copies retry. This poller never submits a generation.
          if (
            (error as { status?: number }).status === 404 &&
            matches(arena.id, slot.id, jobId) &&
            !o.known(arena.id, jobId)
          )
            o.record(arena.id, unavailableRun(jobId));
        }
      }
    } finally {
      inFlight = false;
    }
  }
  return {
    tick,
    stop: () => {
      stopped = true;
    },
  };
}
