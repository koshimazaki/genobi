import { readImageResponse } from "./image-response";
import { isKleinEdit, kleinFiles } from "../shared/comfy/klein-edit";
import type { Expectation } from "../shared/comfy/expectation";
import { deploymentClient } from "./deployments";
import {
  copyDeploymentAudio,
  forgetDeploymentAudio,
  rememberDeploymentAudio,
} from "./deployment-output";
import { h3WorkflowFiles, readsClip } from "./workflow-files";
import { takesVideoReferences } from "../shared/h3";
import { h3RouterBody, isH3Router } from "../shared/comfy/h3-router";
import { isImage, imageBody, inspectImage } from "../shared/image";
import { providerUrl } from "../server/bfl";
import { CREDITS_PER_USD, isLtx, ltxBody } from "../shared/comfy/ltx";
import { settingsHash, type QuoteRecord } from "../shared/quote";
import { isComfyKey } from "../shared/provider";
import { upscaleBody } from "../shared/upscale";
import { workflowOutput, workflowRun } from "../shared/comfy/runs";
import { isUnsent, type WorkflowClient } from "../shared/comfy/workflow";
import { ComfySdkWorkflows } from "../server/comfy-sdk";
import { entryFor } from "../shared/registry";
import {
  defaultProviders,
  providerFor,
  type Providers,
} from "../server/providers";
import { AppError } from "../server/errors";
import { requireQuote } from "../server/take";
import { canonicalInput } from "../shared/idempotency";
import { expireStaleJob, MAX_RESULT_BYTES } from "../shared/lifecycle";
import { composePrompt } from "../shared/presets";
import {
  isTerminal,
  type GenerateInput,
  type Job,
  type JobStatus,
} from "../shared/types";
import {
  inspectObject,
  ownedJob,
  saveJob,
  saveSource,
  type JobRow,
  type ResolvedSource,
} from "./storage";
import { putMedia } from "./media";
import {
  findQuote,
  hashReferences,
  price,
  spendQuoteAndReserve,
} from "./quotes";

const statuses = new Set<JobStatus>([
  "Pending",
  "Reasoning",
  "Generating",
  "Request Moderated",
  "Content Moderated",
  "Error",
]);
const publicJob = (row: JobRow) => JSON.parse(row.data) as Job;
function duplicate(row: JobRow, input: GenerateInput) {
  // Both backends answer a replay with shared/idempotency.ts, never raw JSON.
  if (canonicalInput(JSON.parse(row.input)) !== canonicalInput(input))
    throw new AppError(
      409,
      "That request identifier was already used with different settings.",
    );
  return publicJob(row);
}

const priorJob = (env: Env, session: string, idempotency: string) =>
  env.DB.prepare("SELECT * FROM jobs WHERE session=? AND idempotency=?")
    .bind(session, idempotency)
    .first<JobRow>();

/**
 * Lends the provider (BFL direct, or Router for BFL) a private session object
 * for two hours; public clips need no token.
 */
async function inputVideoUrl(env: Env, source: ResolvedSource, origin: string) {
  if (source.kind === "library") return new URL(source.source.url, origin).href;
  const token = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO shares (token,object_key,expires) VALUES (?,?,?)",
  )
    .bind(token, source.key, Date.now() + 2 * 3600_000)
    .run();
  return `${origin}/api/input/${token}`;
}

export async function submit(
  env: Env,
  input: GenerateInput,
  session: string,
  idempotency: string,
  key: string,
  origin: string,
  quoteId?: string,
  providers: Providers = defaultProviders(),
  workflowClient: WorkflowClient = new ComfySdkWorkflows({
    portableUploads: true,
  }),
  expected?: Expectation,
) {
  const requestInput = input;
  input = await hashReferences(input);
  const provider = providerFor(key, providers);
  const model = input.model ?? "flux-3";
  const existing = await priorJob(env, session, idempotency);
  if (existing) return duplicate(existing, input);
  const { source, estimate, take, deploymentValues } = await price(
    env,
    input,
    session,
    key,
    provider,
    expected,
  );
  if (take.recipe.deployment && !quoteId)
    throw new AppError(
      400,
      "Review and confirm a deployment quote first.",
      "quote_required",
    );
  let quote: QuoteRecord | undefined;
  if (quoteId !== undefined) {
    const found = await findQuote(env, quoteId, session);
    // A concurrent replay may have spent it on this very request.
    const spentHere =
      found?.jobId && (await priorJob(env, session, idempotency));
    if (spentHere) return duplicate(spentHere, input);
    // The route is checked too, as on the local server: a quote taken on one
    // key is not spent on the other provider.
    quote = requireQuote(found, settingsHash(take), Date.now(), take.recipe);
  }
  const now = new Date().toISOString();
  const job: Job = {
    ...input,
    imageReferences: undefined,
    ...(takesVideoReferences(model)
      ? { imageReferenceCount: input.imageReferences?.length ?? 0 }
      : {}),
    ...(isImage(input.generator)
      ? {
          mediaType: "image" as const,
          imageReferenceCount: input.imageReferences?.length ?? 0,
        }
      : {}),
    model,
    id: crypto.randomUUID(),
    // A still's prompt is its description, with the framing a Klein run takes.
    prompt: composePrompt(input),
    status: "submitting",
    createdAt: now,
    updatedAt: now,
    costEstimateUsd: estimate,
    keyMode: "byo",
  };
  // The unique D1 reservation happens before any paid call, across Worker
  // instances; a quote is spent in the same transaction or not at all.
  const reserved = {
    id: job.id,
    input: JSON.stringify(input),
    data: JSON.stringify(job),
    take: JSON.stringify(take),
    createdAt: Date.now(),
  };
  const reservation = quote
    ? await spendQuoteAndReserve(env, quote, session, idempotency, reserved)
    : await env.DB.prepare(
        "INSERT OR IGNORE INTO jobs (id,session,idempotency,input,data,take,created_at) VALUES (?,?,?,?,?,?,?)",
      )
        .bind(
          reserved.id,
          session,
          idempotency,
          reserved.input,
          reserved.data,
          reserved.take,
          reserved.createdAt,
        )
        .run();
  if (!reservation.meta.changes) {
    const prior = await priorJob(env, session, idempotency);
    if (prior) return duplicate(prior, input);
    // Spent or expired between the check above and the transaction.
    if (quote)
      requireQuote(
        await findQuote(env, quote.id, session),
        quote.settings,
        Date.now(),
        take.recipe,
      );
    throw new AppError(
      503,
      "Could not recover this request. Keep the same request identifier.",
    );
  }
  const row = await ownedJob(env, job.id, session);
  const entry = entryFor(input.generator, model);
  try {
    if (entry.route === "workflow") {
      // A workflow, chosen by the registry entry rather than the key. Its job
      // URL takes the polling_url column, so no migration is needed.
      const { template, values } = workflowRun(
        entry.model,
        input,
        job.prompt,
        take.recipe.workflow,
        take.recipe.location,
      );
      if (take.recipe.deployment)
        workflowClient = deploymentClient(take.recipe.deployment.url);
      row.polling_url = await workflowClient.run(
        template,
        take.recipe.deployment ? deploymentValues : values,
        key,
        {
          idempotencyKey: job.id,
          ...(isKleinEdit(requestInput)
            ? { files: kleinFiles(requestInput) }
            : {}),
          ...(readsClip(input)
            ? {
                files: await h3WorkflowFiles(
                  env,
                  requestInput,
                  source!,
                  origin,
                ),
              }
            : {}),
        },
      );
      job.status = "Pending";
      await saveJob(env, row, job);
      return job;
    }
    const inputVideo = source
      ? await inputVideoUrl(env, source, origin)
      : undefined;
    const body = isImage(input.generator)
      ? imageBody(requestInput, job.prompt)
      : inputVideo
        ? upscaleBody(input, job.prompt, inputVideo, key, session)
        : isLtx(model)
          ? ltxBody(input, job.prompt)
          : isH3Router(model)
            ? h3RouterBody(requestInput, job.prompt)
            : {
                mode: model === "flux-3-i2v" ? "i2v" : "t2v",
                ...(model === "flux-3-i2v"
                  ? {
                      keyframes: requestInput.imageReferences!.map((ref) =>
                        ref.slice(ref.indexOf(",") + 1),
                      ),
                    }
                  : {}),
                prompt: job.prompt,
                duration: input.duration,
                resolution: input.resolution,
                aspect_ratio: input.aspectRatio,
                generate_audio: true,
                draft: input.draft,
                safety_tolerance: 2,
                ...(isComfyKey(key) ? {} : { user: session }),
              };
    const result = await provider.submit(input.generator, body, key, {
      model,
      idempotencyKey: idempotency,
    });
    row.polling_url = result.polling_url;
    job.status = "Pending";
    if (
      typeof result.cost === "number" &&
      Number.isFinite(result.cost) &&
      result.cost >= 0
    )
      job.costActualUsd = result.cost / 100;
  } catch (error) {
    job.status = "Error";
    job.error =
      error instanceof AppError
        ? error.message
        : "Submission could not be confirmed. Check BFL usage before trying again.";
    // Refused before anything was sent: a known zero, not an uncertain charge.
    if (isUnsent(error)) job.costActualUsd = 0;
  }
  await saveJob(env, row, job);
  return job;
}

export async function poll(
  env: Env,
  id: string,
  session: string,
  key?: string,
  providers: Providers = defaultProviders(),
  workflowClient: WorkflowClient = new ComfySdkWorkflows({
    portableUploads: true,
  }),
) {
  const row = await ownedJob(env, id, session);
  const job = publicJob(row);
  if (isTerminal(job.status)) return { job };
  if (job.status === "submitting") {
    if (Date.now() - row.created_at > 120_000) {
      job.status = "Error";
      job.error =
        "Submission could not be confirmed. Check BFL usage before trying again.";
      await saveJob(env, row, job);
    }
    return { job };
  }
  // The same age limit the sweep applies, so a returning tab and the background
  // sweep agree on when a job stopped being worth polling.
  if (expireStaleJob(job, row.created_at)) {
    row.polling_url = null;
    row.remote_url = null;
    await saveJob(env, row, job);
    return { job };
  }
  if (!key) return { job, needsKey: true };
  const now = Date.now();
  const acquired = await env.DB.prepare(
    "UPDATE jobs SET lease_until=? WHERE id=? AND session=? AND lease_until<?",
  )
    .bind(now + 120_000, id, session, now)
    .run();
  if (!acquired.meta.changes) return { job };
  // A workflow polls and downloads through the workflow client, by entry.
  const entry = entryFor(job.generator, job.model);
  const viaWorkflow = entry.route === "workflow";
  const recipe = row.take ? JSON.parse(row.take).recipe : undefined;
  if (recipe?.deployment)
    workflowClient = deploymentClient(recipe.deployment.url);
  try {
    delete job.error;
    if (!row.remote_url) {
      const result = viaWorkflow
        ? await workflowClient.poll(
            row.polling_url!,
            key,
            workflowOutput(entry.model, recipe?.workflow),
          )
        : await providerFor(key, providers).poll(row.polling_url!, key);
      if (
        typeof result.cost === "number" &&
        Number.isFinite(result.cost) &&
        result.cost >= 0
      )
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
        providerUrl(result.result.sample, "media");
        if (recipe?.deployment)
          await rememberDeploymentAudio(env, row.id, result.companions ?? []);
        row.remote_url = result.result.sample;
        job.status = "copying";
        await saveJob(env, row, job);
      } else if (statuses.has(result.status as JobStatus)) {
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
    if (job.status === "stopped") return { job };
    if (row.remote_url) {
      const image = isImage(job.generator);
      const objectKey = `${session}/${job.id}.${image ? "image" : "mp4"}`;
      if (!(await env.MEDIA.head(objectKey))) {
        const response = await (
          viaWorkflow ? workflowClient : providerFor(key, providers)
        ).download(row.remote_url);
        if (image) {
          const data = await readImageResponse(response);
          const metadata = inspectImage(data);
          await env.MEDIA.put(objectKey, data, {
            httpMetadata: { contentType: metadata.contentType },
          });
        } else
          await putMedia(
            env,
            objectKey,
            response.body!,
            Number(response.headers.get("content-length")),
            MAX_RESULT_BYTES,
          );
      }
      const object = image ? await env.MEDIA.get(objectKey) : null;
      const { metadata, bytes } =
        image && object
          ? {
              metadata: inspectImage(
                new Uint8Array(await object.arrayBuffer()),
              ),
              bytes: object.size,
            }
          : await inspectObject(env, objectKey);
      if (
        image &&
        "contentType" in metadata &&
        typeof metadata.contentType === "string"
      )
        job.resultContentType = metadata.contentType;
      job.resultUrl = `/api/clips/${job.id}`;
      await saveSource(
        env,
        {
          id: job.id,
          label: job.description.slice(0, 100) || "Upscaled video",
          url: job.resultUrl,
          origin: "generated",
          ...(image ? { mediaType: "image" as const } : {}),
          ...metadata,
        },
        session,
        objectKey,
        bytes,
      );
      if (recipe?.deployment)
        await copyDeploymentAudio(env, row, job, workflowClient);
      job.status = "Ready";
      row.remote_url = null;
    }
  } catch (error) {
    job.error =
      error instanceof AppError
        ? error.message
        : "Connection interrupted. This job will be checked again.";
    if (error instanceof AppError && error.code === "delivery_expired")
      job.status = "expired";
  } finally {
    await saveJob(env, row, job);
    // A failed final save leaves the receipt for the next poll. Once Ready is
    // durable, failed cleanup can wait for the bounded retention sweep.
    if (recipe?.deployment && job.status === "Ready")
      await forgetDeploymentAudio(env, row.id).catch(() => {});
    await env.DB.prepare(
      "UPDATE jobs SET lease_until=? WHERE id=? AND session=?",
    )
      .bind(Date.now() + 3000, id, session)
      .run();
  }
  return { job };
}
