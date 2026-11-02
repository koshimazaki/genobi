import type { Job } from "../shared/types";
import { isDeployModel } from "../shared/comfy/deploy-catalogue";
import { isH3, takesVideoReferences } from "../shared/h3";
import { isImage } from "../shared/image";
import { restoredRunInputs, type RunInputs } from "./run-inputs";

/**
 * What a Recreate cannot bring back, by model. Camera's Recreate restores a
 * run's prompt and settings from its job; some inputs live elsewhere:
 *
 * - reference images (every image model, FLUX 3 image-to-video, both H3 paths
 *   and the Openjutsu swap) live only in this browser's private run inputs
 *   (`run-inputs.ts`), never in the job;
 * - the source video (an upscale, the H3 OmniRef workflows) is a library id
 *   on the job, absent on runs recorded without one;
 * - a deployment's inputs and the swap's settings are on the job when it
 *   recorded them.
 *
 * Each missing piece is named rather than silently dropped, so Camera can
 * say "settings not stored" instead of looking restored.
 */
export type RecreateGap =
  "reference images" | "source video" | "deployment inputs" | "swap settings";

/** Which inputs a run of this model needs beyond its prompt and settings. */
export function recreateNeeds(job: Pick<Job, "generator" | "model">) {
  return {
    references: isImage(job.generator) || takesVideoReferences(job.model),
    source: job.generator === "upscale" || isH3(job.model),
    deploy: isDeployModel(job.model),
    swap: job.model === "openjutsu-swap",
  };
}

export function recreateGaps(job: Job, inputs?: RunInputs): RecreateGap[] {
  const needs = recreateNeeds(job);
  const gaps: RecreateGap[] = [];
  const restored = restoredRunInputs(job, inputs).imageReferences?.length ?? 0;
  // An image run without references is a text-to-image run; only a run that
  // recorded sending some is missing them.
  if (needs.references && (job.imageReferenceCount ?? 0) > restored)
    gaps.push("reference images");
  if (needs.source && !job.sourceId) gaps.push("source video");
  if (needs.deploy && !job.deploy) gaps.push("deployment inputs");
  if (needs.swap && !job.swap) gaps.push("swap settings");
  return gaps;
}

/** The one sentence Camera shows for a partial Recreate, or "" when whole. */
export function recreateGapMessage(gaps: readonly RecreateGap[]) {
  if (!gaps.length) return "";
  const join = (items: readonly string[]) =>
    items.length === 1
      ? items[0]
      : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
  // References are kept per browser; the rest are on the run's own record.
  const browser = gaps.includes("reference images");
  const run = gaps.filter((gap) => gap !== "reference images");
  const parts = [
    ...(browser ? ["Reference images are not stored in this browser."] : []),
    ...(run.length ? [`Not stored for this run: ${join(run)}.`] : []),
  ];
  return `${parts.join(" ")} Camera restored the rest. ${browser ? "Reattach the references" : "Choose them again"} before generating.`;
}
