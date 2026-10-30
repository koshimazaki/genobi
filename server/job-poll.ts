import { saveDeploymentAudio } from "./deployment-output";
import { saveResult } from "./job-output";
import { AppError } from "./errors";
import { providerUrl } from "./bfl";
import { providerStatuses } from "./job-request";
import { entryFor } from "../shared/registry";
import { CREDITS_PER_USD } from "../shared/comfy/ltx";
import { workflowOutput } from "../shared/comfy/runs";
import type { WorkflowClient } from "../shared/comfy/workflow";
import type { Provider } from "../shared/provider";
import { isTerminal, type JobStatus } from "../shared/types";
import type { Store, StoredJob } from "./store";

/** Poll/copy only. Recovery never calls a generation submission. */
export async function pollJob(
  store: Store,
  workflows: WorkflowClient,
  provider: Provider,
  job: StoredJob,
  key: string,
) {
  job.lastPolledAt = Date.now();
  const entry = entryFor(job.generator, job.model);
  const workflow = entry.route === "workflow";
  try {
    if (job.status !== "copying" || !job.resultRemoteUrl) {
      const result = workflow
        ? await workflows.poll(
            job.pollingUrl!,
            key,
            workflowOutput(entry.model, job.take?.recipe.workflow),
          )
        : await provider.poll(job.pollingUrl!, key);
      if (isTerminal(job.status)) return job;
      if (typeof result.cost === "number" && Number.isFinite(result.cost))
        job.costActualUsd = result.cost / 100;
      if (
        typeof result.credits === "number" &&
        Number.isFinite(result.credits)
      ) {
        job.costCredits = result.credits;
        job.costActualUsd = result.credits / CREDITS_PER_USD;
      }
      if (
        typeof result.progress === "number" &&
        Number.isFinite(result.progress)
      )
        job.progress = result.progress;
      if (result.estimate) job.estimate = result.estimate;
      if (result.status === "Ready" && result.result?.sample) {
        if (!workflow) providerUrl(result.result.sample, "media");
        job.resultRemoteUrl = result.result.sample;
        job.companionDownloads = result.companions;
        job.status = "copying";
        await store.save();
      } else if (providerStatuses.has(result.status as JobStatus)) {
        job.status = result.status as JobStatus;
        if (isTerminal(job.status))
          job.error =
            job.status === "Error"
              ? (result.error ?? "The provider could not finish this run.")
              : "This request was stopped by the provider's moderation.";
      } else if (result.status === "stopped") {
        job.status = "stopped";
        job.error = "The run was cancelled on Comfy Cloud.";
      } else if (result.status === "Task not found") {
        job.status = "expired";
        job.error =
          "The provider no longer has this job. Check your usage before starting another.";
      }
    }
    if (job.status === "copying" && job.resultRemoteUrl) {
      const { file, mediaType, metadata } = await saveResult(
        store.directory,
        job,
        await (workflow
          ? workflows.download(job.resultRemoteUrl, key)
          : provider.download(job.resultRemoteUrl)),
      );
      if (isTerminal(job.status)) return job;
      if (mediaType !== "video" && metadata.contentType)
        job.resultContentType = metadata.contentType;
      job.resultUrl = `/api/clips/${job.id}`;
      if (!store.data.sources.some((source) => source.id === job.id))
        store.data.sources.push({
          id: job.id,
          sessionId: job.sessionId,
          filePath: file,
          url: job.resultUrl,
          label:
            job.description.slice(0, 100) ||
            (mediaType === "audio" ? "Generated music" : "Upscaled video"),
          origin: "generated",
          ...(mediaType === "video" ? {} : { mediaType }),
          ...metadata,
        });
      await saveDeploymentAudio(store, job, workflows);
      job.status = "Ready";
      delete job.error;
      delete job.resultRemoteUrl;
    }
  } catch (error) {
    if (isTerminal(job.status)) return job;
    job.error =
      error instanceof AppError
        ? error.message
        : "Connection interrupted. This job will be checked again.";
    if (error instanceof AppError && error.code === "delivery_expired")
      job.status = "expired";
  }
  job.updatedAt = new Date().toISOString();
  await store.save();
  return job;
}
