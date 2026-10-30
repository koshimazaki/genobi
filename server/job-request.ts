// What a local submission stores for replay and what it sends to a provider.
// Kept beside JobService so the service holds the lifecycle and these hold the
// request shapes.
import { takesVideoReferences } from "../shared/h3";
import { h3RouterBody, isH3Router } from "../shared/comfy/h3-router";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isLtx, ltxBody } from "../shared/comfy/ltx";
import { canonicalInput } from "../shared/idempotency";
import { imageBody, isImage } from "../shared/image";
import { isComfyKey } from "../shared/provider";
import { upscaleBody } from "../shared/upscale";
import type { GenerateInput, JobStatus } from "../shared/types";
import { AppError } from "./errors";
import type { StoredJob } from "./store";

/** Persisted replay state holds reference fingerprints, never the bytes. */
/** The statuses a provider's poll answer may set on a job as they are. */
export const providerStatuses = new Set<JobStatus>([
  "Pending",
  "Reasoning",
  "Generating",
  "Request Moderated",
  "Content Moderated",
  "Error",
]);

export const hashReferences = (input: GenerateInput): GenerateInput =>
  isImage(input.generator) || takesVideoReferences(input.model)
    ? {
        ...input,
        imageReferences: input.imageReferences?.map((ref) =>
          createHash("sha256").update(ref).digest("hex"),
        ),
      }
    : input;

export function checkDuplicate(existing: StoredJob, input: GenerateInput) {
  // Both backends answer a replay with shared/idempotency.ts, never a local rule.
  if (canonicalInput(existing) !== canonicalInput(input))
    throw new AppError(
      409,
      "That request identifier was already used with different settings.",
    );
  return existing;
}

/**
 * The run this session sent under `idempotencyKey`, if any. A key that already
 * belongs to another session fails closed: an agent whose MCP server restarted
 * lost its session cookie, so a "same key" retry would otherwise start a second
 * paid run. The local server has one operator, so refusing leaks nothing.
 */
export function replayOf(
  jobs: StoredJob[],
  sessionId: string,
  idempotencyKey: string,
) {
  const job = jobs.find(
    (item) =>
      item.sessionId === sessionId && item.idempotencyKey === idempotencyKey,
  );
  if (!job && jobs.some((item) => item.idempotencyKey === idempotencyKey))
    throw new AppError(
      409,
      "That request identifier already belongs to a run in another studio session, so nothing new was started. Check the studio's history before running it again.",
      "idempotency_other_session",
    );
  return job;
}

/**
 * The provider body for one Router or BFL submission. `requestInput` still
 * carries image reference bytes; `input` is the hashed copy that is stored.
 * `sourceFile` is the upscale source, read only when there is one.
 */
export async function providerBody(
  requestInput: GenerateInput,
  input: GenerateInput,
  prompt: string,
  sourceFile: string | undefined,
  model: NonNullable<GenerateInput["model"]>,
  key: string,
  sessionId: string,
) {
  return isImage(input.generator)
    ? imageBody(requestInput, prompt)
    : sourceFile !== undefined
      ? // The local source is at most 50 MB (`checkUpscaleLimits`), sent inline.
        upscaleBody(
          input,
          prompt,
          (await readFile(sourceFile)).toString("base64"),
          key,
          sessionId,
        )
      : isLtx(model)
        ? ltxBody(input, prompt)
        : isH3Router(model)
          ? // The sheet and the storyboard go inline as the data URLs sent.
            h3RouterBody(requestInput, prompt)
          : {
              mode: model === "flux-3-i2v" ? "i2v" : "t2v",
              ...(model === "flux-3-i2v"
                ? {
                    keyframes: requestInput.imageReferences!.map((ref) =>
                      ref.slice(ref.indexOf(",") + 1),
                    ),
                  }
                : {}),
              prompt,
              duration: input.duration,
              resolution: input.resolution,
              aspect_ratio: input.aspectRatio,
              generate_audio: true,
              draft: input.draft,
              safety_tolerance: 2,
              // Router's FLUX schema allows no extra fields; BFL direct takes a user tag.
              ...(isComfyKey(key) ? {} : { user: sessionId }),
            };
}
