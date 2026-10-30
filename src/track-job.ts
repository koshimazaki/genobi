import { isVideoSource, type Job, type Source } from "../shared/types";

/**
 * Registers one job with the poller by its own free read: a chain stage
 * started outside `generate`. A stage first read as Ready never passes
 * through the poller's own Ready refresh, so its measured clip (the source
 * the Studio review prices an upscale from) is fetched here through history.
 * False when a read failed, so the hand-off is tried again; it never
 * resubmits anything.
 */
export async function trackJob({
  id,
  jobs,
  sources,
  readJob,
  add,
  refresh,
}: {
  id: string;
  jobs: readonly Job[];
  sources: readonly Source[];
  readJob: (id: string) => Promise<Job>;
  add: (job: Job) => void;
  /** History: the job list and the measured sources, read again. */
  refresh: () => Promise<void>;
}): Promise<boolean> {
  try {
    let job = jobs.find((item) => item.id === id);
    if (!job) {
      job = await readJob(id);
      add(job);
    }
    const unmeasured =
      job.status === "Ready" &&
      job.mediaAvailable !== false &&
      (job.generator === "video" || job.generator === "upscale") &&
      !sources.some((source) => source.id === id && isVideoSource(source));
    if (unmeasured) await refresh();
    return true;
  } catch {
    return false;
  }
}
