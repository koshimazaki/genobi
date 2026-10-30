import type { Job } from "../../shared/types";
import type { Take } from "../../shared/take";
import type { ActivityEvent } from "../../shared/activity";
import { activityState, recordBrowserActivity } from "./store";
/** Hosted and local studios observe actual job state, not the initiating input method. */
export async function recordJobActivity(job: Job) {
  if (!activityState().enabled) return;
  const phase =
    job.status === "Ready"
      ? "succeeded"
      : job.status === "Error"
        ? "failed"
        : job.status === "stopped"
          ? "unknown"
          : "started";
  let backend: ActivityEvent["backend"];
  if (job.status === "Ready") {
    try {
      const response = await fetch(`/api/takes/${encodeURIComponent(job.id)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const { take } = (await response.json()) as { take: Take };
        const r = take.recipe;
        backend =
          r.route === "router"
            ? "router"
            : r.route === "bfl"
              ? "bfl"
              : r.location === "local"
                ? "local"
                : r.location === "cloud" || r.route === "workflow"
                  ? "cloud"
                  : undefined;
      }
    } catch {
      /* No guessed backend; the owned job/take remains the source of truth. */
    }
  }
  return recordBrowserActivity("generation", phase, `job_${job.id}`, backend);
}
