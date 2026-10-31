import { isKleinEdit, kleinFiles } from "../shared/comfy/klein-edit";
import { WorkflowDestinations } from "./workflow-destinations";
import { pollJob } from "./job-poll";
import { DeploymentAssets } from "./deployment-assets";
import { isDeployModel } from "../shared/comfy/deploy-catalogue";
import { takesVideoReferences } from "../shared/h3";
import { clipFiles, isSwap, readsSourceClip } from "../shared/openjutsu";
import { swapSource } from "./swap-source";
import { isImage } from "../shared/image";
import { isMusic } from "../shared/music";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { composePrompt } from "../shared/presets";
import {
  isTerminal,
  isVideoSource,
  type GenerateInput,
  type JobOrigin,
} from "../shared/types";
import { AppError, requireKey } from "./errors";
import { requireQuote } from "./take";
import { isComfyKey, requireRoute } from "../shared/provider";
import {
  estimateRunUsd,
  newQuote,
  publicQuote,
  settingsHash,
} from "../shared/quote";
import { startTake } from "../shared/take";
import { workflowRun } from "../shared/comfy/runs";
import {
  handleJobId,
  isUnsent,
  type WorkflowClient,
} from "../shared/comfy/workflow";
import { isSeedvr2, requireSeedvr2Fit } from "../shared/comfy/seedvr2";
import { UPSCALE_SPLIT_MAX_SECONDS } from "../shared/upscale-parts";
import { WorkflowSettings } from "./workflow-settings";
import { notConfigured } from "../shared/comfy/destination";
import { ComfySdkWorkflows } from "./comfy-sdk";
import { entryFor } from "../shared/registry";
import { defaultProviders, providerFor, type Providers } from "./providers";
import { closeRetired, isLocalRun, runCredential, ServerKeys } from "./keys";
import { demoBudget, requireBudget } from "./budget";
import { sessionSource, validateUpscaleSource } from "./media";
import { historyOf } from "./shared-takes";
import { sweepJobs } from "./job-sweep";
import { Store, type StoredJob } from "./store";
import {
  checkDuplicate,
  hashReferences,
  providerBody,
  replayOf,
} from "./job-request";
import { requireApprovalPayer, type ApprovalTerms } from "./agent-approvals";

export { BUDGET_USD, SESSION_LIMIT } from "./budget";

/**
 * Who made a run (`server/shared-takes.ts`), and the session that holds an
 * upscale's source when the studio upscales a shared take: a read only.
 */
export interface Made {
  origin?: JobOrigin;
  sourceSession?: string;
}
export class JobService {
  private locks = new Map<string, Promise<StoredJob>>();
  constructor(
    readonly store: Store,
    readonly publicDirectory: string,
    private keys: ServerKeys = new ServerKeys(),
    private providers: Providers = defaultProviders(),
    private workflows: WorkflowClient = new WorkflowDestinations(
      new ComfySdkWorkflows(),
    ),
    readonly settings = new WorkflowSettings(store),
    readonly deploymentAssets = new DeploymentAssets(settings, keys),
  ) {
    // Fill only fields introduced after the first local jobs were recorded.
    for (const job of store.data.jobs) {
      job.aspectRatio ??= "16:9";
      job.upscaleCreativity ??= 0;
      job.model ??= "flux-3";
    }
  }
  /** The key a run spends and whose it is: one rule for quote and submit. */
  credential(input: GenerateInput, sessionId: string, byo?: string) {
    const model = input.model ?? "flux-3";
    const plan = this.settings.planFor(sessionId, input.generator, model);
    return runCredential(this.keys, input.generator, model, byo, plan.location, input.imageProvider ?? "auto");
  }
  private provider(key: string) {
    return providerFor(key, this.providers);
  }
  get hasServerKey() {
    return this.keys.any;
  }

  owned(id: string, sessionId: string) {
    const job = this.store.data.jobs.find(
      (item) => item.id === id && item.sessionId === sessionId,
    );
    if (!job) throw new AppError(404, "Job not found.");
    return job;
  }

  /** The session's history; the studio's also lists shared takes. */
  history(sessionId: string, shared = false) {
    return historyOf(this.store, this.publicDirectory, sessionId, shared);
  }

  /** A source this session may name: its own, or a library clip. */
  source(id: string, sessionId: string) {
    return sessionSource(this.store, this.publicDirectory, id, sessionId);
  }

  /**
   * The checks and price a submission and a quote share, so a quote can never
   * promise a run the submission would refuse or price differently.
   * `sourceSession` holds an upscale's source or deployment input tickets:
   * a picked take, or an approval's explicitly quoted inputs.
   */
  private async price(
    input: GenerateInput,
    sessionId: string,
    key: string,
    sourceSession = sessionId,
  ) {
    const model = input.model ?? "flux-3";
    const plan = this.settings.planFor(sessionId, input.generator, model);
    if (
      plan.location &&
      this.workflows.serves?.(plan.location, plan.deployment) === false
    )
      throw notConfigured({ kind: plan.location });
    if (isDeployModel(model)) {
      this.deploymentAssets.validate(
        input,
        sourceSession,
        plan.deployment!.url,
      );
      workflowRun(
        entryFor(input.generator, model).model,
        input,
        composePrompt(input),
        plan.workflow,
        plan.location,
      );
    }
    const local = plan.location === "local"; // free: no provider key needed
    if (!local) requireRoute(input.generator, model, key);
    const source = readsSourceClip(input)
      ? await this.source(input.sourceId!, sourceSession)
      : undefined;
    if (source && !isVideoSource(source.source))
      throw new AppError(400, "Choose a video to upscale.");
    const metadata = !source
      ? undefined
      : isSwap(model)
        ? await swapSource(input, source.file)
        : await validateUpscaleSource(
            source.file,
            local && isSeedvr2(model) ? UPSCALE_SPLIT_MAX_SECONDS : undefined,
          );
    if (metadata && isSeedvr2(model))
      requireSeedvr2Fit(metadata, input.upscaleFactor);
    const estimate =
      local || plan.location === "deployment"
        ? 0
        : estimateRunUsd(input, metadata);
    const take = await startTake(input, isComfyKey(key), source?.sha256, plan);
    return { model, source, estimate, take };
  }

  /** What the demo budget leaves this session today (`server/budget.ts`). */
  budget(sessionId: string) {
    return demoBudget(this.store.data.jobs, sessionId);
  }

  async quote(
    input: GenerateInput,
    sessionId: string,
    byoKey?: string,
    sourceSession?: string,
  ) {
    const { estimate, take } = await this.keys.reserving(async () => {
      const { key, mode } = this.credential(input, sessionId, byoKey);
      const hashed = hashReferences(input);
      const priced = await this.price(hashed, sessionId, key, sourceSession);
      requireBudget(
        this.store.data.jobs,
        sessionId,
        priced.estimate,
        mode,
        priced.take,
      );
      return priced;
    });
    const now = Date.now();
    const quote = { ...newQuote(take, estimate, now), sessionId };
    // An expired quote can never be spent, so it goes rather than accumulating.
    this.store.data.quotes = this.store.data.quotes.filter(
      (item) => Date.parse(item.expiresAt) > now,
    );
    this.store.data.quotes.push(quote);
    await this.store.save();
    return publicQuote(quote);
  }

  /** Chooses the key, prices, checks and records the run; nothing is sent. */
  private async reserve(
    input: GenerateInput,
    sessionId: string,
    idempotencyKey: string,
    byoKey?: string,
    quoteId?: string,
    terms?: ApprovalTerms,
    made: Made = {},
  ) {
    const { key, mode } = this.credential(input, sessionId, byoKey);
    const { model, source, estimate, take } = await this.price(
      input,
      sessionId,
      key,
      terms?.sourceSession ?? made.sourceSession,
    );
    if (take.recipe.location === "deployment" && quoteId === undefined)
      throw new AppError(
        400,
        "Quote and confirm this deployment run first.",
        "quote_missing",
      );
    // Under the same key lock that chose the credential: the approved payer.
    if (terms) requireApprovalPayer(terms, mode, take.recipe.location);
    // A duplicate can arrive while an upscale source is being probed.
    const duplicate = replayOf(this.store.data.jobs, sessionId, idempotencyKey);
    if (duplicate)
      return { replay: true as const, job: checkDuplicate(duplicate, input) };
    // No await between the quote and budget checks and insertion: reservations
    // are atomic in this one process, so a quote is spent exactly once.
    const quote =
      quoteId === undefined
        ? undefined
        : requireQuote(
            this.store.data.quotes.find(
              (item) => item.id === quoteId && item.sessionId === sessionId,
            ),
            settingsHash(take),
            Date.now(),
            take.recipe,
          );
    requireBudget(this.store.data.jobs, sessionId, estimate, mode, take);
    const now = new Date().toISOString();
    const job: StoredJob = {
      ...input,
      ...(takesVideoReferences(model)
        ? { imageReferenceCount: input.imageReferences?.length ?? 0 }
        : {}),
      model,
      id: randomUUID(),
      sessionId,
      idempotencyKey,
      // A still's prompt is its description, with the framing a Klein run takes.
      prompt: composePrompt(input),
      ...(isImage(input.generator)
        ? {
            mediaType: "image" as const,
            imageReferenceCount: input.imageReferences?.length ?? 0,
          }
        : isMusic(input.generator)
          ? { mediaType: "audio" as const }
          : {}),
      status: "submitting",
      createdAt: now,
      updatedAt: now,
      costEstimateUsd: estimate,
      keyMode: mode,
      ...(made.origin ? { origin: made.origin } : {}),
      take,
      ...(take.recipe.deployment ? { deployment: take.recipe.deployment } : {}),
    };
    if (quote) quote.jobId = job.id;
    this.store.data.jobs.push(job);
    return { replay: false as const, job, key, model, source };
  }

  async submit(
    input: GenerateInput,
    sessionId: string,
    idempotencyKey: string,
    byoKey?: string,
    quoteId?: string,
    /** An agent's step the person approved (`server/agent-approvals.ts`). */
    terms?: ApprovalTerms,
    made?: Made,
  ) {
    const requestInput = input;
    input = hashReferences(input);
    const existing = replayOf(this.store.data.jobs, sessionId, idempotencyKey);
    if (existing) return checkDuplicate(existing, input);
    // From the key's choice until its job is recorded, no saved key changes:
    // `finishingOn` must see this run before its slot can be replaced.
    const reserved = await this.keys.reserving(() =>
      this.reserve(
        input,
        sessionId,
        idempotencyKey,
        byoKey,
        quoteId,
        terms,
        made,
      ),
    );
    if (reserved.replay) return reserved.job;
    const { job, key, model, source } = reserved;
    terms?.onReserved?.(job.id); // before anything is sent: recoverable
    const take = job.take!;
    await this.store.save();
    const entry = entryFor(input.generator, model);
    try {
      if (entry.route === "workflow") {
        // A workflow, by entry not key, as its take recorded (template, location).
        const { template, values } = workflowRun(
          entry.model,
          input,
          job.prompt,
          take.recipe.workflow,
          take.recipe.location,
        );
        const filled =
          take.recipe.deployment && isDeployModel(model)
            ? this.deploymentAssets.values(
                values,
                input,
                terms?.sourceSession ?? sessionId,
                take.recipe.deployment.url,
              )
            : values;
        const handle = await this.workflows.run(template, filled, key, {
          idempotencyKey: job.id,
          location: take.recipe.location,
          deployment: take.recipe.deployment,
          ...(isKleinEdit(requestInput)
            ? { files: kleinFiles(requestInput) }
            : {}),
          ...(source
            ? {
                files: clipFiles(
                  input,
                  requestInput,
                  await readFile(source.file),
                ),
              }
            : {}),
        });
        if (isTerminal(job.status)) return job;
        // The job's URL stands where a Router job keeps its polling URL.
        job.providerId = handleJobId(handle);
        job.pollingUrl = handle;
        job.status = "Pending";
        job.updatedAt = new Date().toISOString();
        await this.store.save();
        return job;
      }
      const body = await providerBody(
        requestInput,
        input,
        job.prompt,
        source?.file,
        model,
        key,
        sessionId,
      );
      const response = await this.provider(key).submit(
        input.generator,
        body,
        key,
        { model, idempotencyKey },
      );
      if (isTerminal(job.status)) return job;
      job.providerId = response.id;
      job.pollingUrl = response.polling_url;
      job.status = "Pending";
      if (typeof response.cost === "number" && Number.isFinite(response.cost))
        job.costActualUsd = response.cost / 100;
    } catch (error) {
      if (isTerminal(job.status)) return job;
      job.status = "Error";
      job.error =
        error instanceof AppError
          ? error.message
          : "The request could not be completed. Check BFL usage before trying again.";
      // Refused before anything was sent: a known zero, not an uncertain charge.
      if (isUnsent(error)) job.costActualUsd = 0;
    }
    job.updatedAt = new Date().toISOString();
    await this.store.save();
    return job;
  }

  async poll(id: string, sessionId: string, byoKey?: string) {
    const job = this.owned(id, sessionId);
    if (isTerminal(job.status) || job.status === "submitting") return { job };
    if (closeRetired(job)) {
      await this.store.save();
      return { job };
    }
    // A local ComfyUI run needs no key on any path: none is sent to it.
    const local = isLocalRun(job);
    if (!local && job.keyMode === "byo" && !byoKey)
      return { job, needsKey: true };
    const key = local ? "" : requireKey(this.keys.forPoll(job, byoKey));
    const existing = this.locks.get(id);
    if (existing) return { job: await existing };
    if (Date.now() - (job.lastPolledAt ?? 0) < 4_000) return { job };
    const promise = pollJob(
      this.store,
      this.workflows,
      this.provider(key),
      job,
      key,
    ).finally(() => this.locks.delete(id));
    this.locks.set(id, promise);
    return { job: await promise };
  }

  /** The local mirror of the Worker sweep (`server/job-sweep.ts`). */
  sweep(now = Date.now()) {
    return sweepJobs(this.store, now);
  }

  /** Runs this server can poll alone: a local one always, others on its keys. */
  async resumeServerJobs() {
    const pending = this.store.data.jobs.filter(
      (job) =>
        !isTerminal(job.status) &&
        job.status !== "submitting" &&
        (isLocalRun(job) ||
          (job.keyMode !== "byo" && Boolean(this.keys.forPoll(job)))),
    );
    await Promise.allSettled(
      pending.map((job) => this.poll(job.id, job.sessionId)),
    );
  }
}
