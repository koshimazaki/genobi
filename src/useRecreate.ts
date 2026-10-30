import type { Job } from "../shared/types";
import { RunRestorer } from "./run-restore";
import {
  restoreWrites,
  setRestoring,
  settingsHold,
  setupChoices,
} from "./settings-store";

/**
 * The studio's one Recreate restorer. While it restores, Generate says
 * "Restoring…" and sends nothing (`useSettingsHold`); what it restores is
 * noted as what the studio now shows unless a newer save or read of the same
 * setting started after it.
 */
const restorer = new RunRestorer(
  setRestoring,
  {
    readTake: (jobId) =>
      fetch(`/api/takes/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
        // A read that never answers must not hold Generate forever.
        signal: AbortSignal.timeout(10_000),
      }),
    // Through each setting's lane, numbered with every save and read of it.
    selectWorkflow: (entry, template) =>
      restoreWrites.workflow(entry, template),
    saveRunLocation: (location) => restoreWrites.location(location),
  },
  // Superseded by any newer setup choice, not only another Recreate.
  setupChoices,
);

/** Outside React: whether a restore is still in flight. */
export const isRestoring = () => settingsHold() === "restoring";

/** Recreate's restore of the run's template and run location. */
export const restoreRun = (job: Job, onError: (message: string) => void) =>
  restorer.restore(job, onError);
