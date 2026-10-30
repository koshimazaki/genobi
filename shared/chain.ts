import type { OutputTargetId } from "./output-targets";
import { QUOTE_TTL_MS, type Quote } from "./quote";
import {
  isTerminal,
  type GenerateInput,
  type Generator,
  type Job,
} from "./types";

/**
 * A chain is an ordered list of paid stages with an approval between each:
 * draft → review → upscale. Every stage is an ordinary job input (validated by
 * `validateInput`), and every stage after the first reads an earlier stage's
 * `Ready` take. Nothing runs without an approval, stage 1 included:
 *
 * 1. Creating a chain validates every stage and quotes stage 1 only.
 * 2. The chain pauses at a stage with a one-use quote (`shared/quote.ts`).
 * 3. Approving with that `Quote-Id` records the approval on the chain first,
 *    as a claim only that approval may release, then submits the stage as a
 *    job under its own idempotency key (`chainStageKey`), spending the quote
 *    in the job's reservation. An approval that finds another one standing
 *    answers with the chain and submits nothing.
 * 4. When that job is `Ready`, reading the chain pauses it at the next stage
 *    with a fresh quote for the input it will now read.
 *
 * A stage's job is found by that key, so the chain never holds a second copy
 * of job state, and approving twice can never start two runs: the job layer
 * answers the same key with the same job. A stage whose job ends any other way
 * fails the chain; an uncertain submission is never retried. A paused chain
 * can be cancelled.
 */
export const MAX_CHAIN_STAGES = 6;
/** A chain id: a UUID, as `crypto.randomUUID` writes it. */
export const CHAIN_ID = /^[0-9a-f-]{36}$/;

/** What a stage makes. */
export const MAKES: Record<Generator, "video" | "image" | "audio"> = {
  video: "video",
  upscale: "video",
  image: "image",
  edit: "image",
  audio: "audio",
};
/**
 * The generators that read an earlier stage, and what they read. An upscale
 * reads a video by its asset id. Edit and image-to-video read media as request
 * bytes today, which a chain would have to store until approval, so they join
 * when they read an asset id instead.
 */
export const CONSUMES: Partial<Record<Generator, "video" | "image">> = {
  upscale: "video",
};

/**
 * An approval, stored before its stage is submitted. `claimId` is the
 * approving request's own, so a failed approval can release its claim and
 * never another's.
 */
export interface ChainApproval {
  quoteId: string;
  claimId: string;
  at: string;
}

/**
 * How long an approval may stand without its job. Its quote was made before
 * the claim, so past this the quote has expired and the claim's submission can
 * no longer reserve a run: pausing the stage again cannot start a second one.
 * The extra minute covers clocks that disagree between Worker instances.
 */
export const APPROVAL_TIMEOUT_MS = QUOTE_TTL_MS + 60_000;

export interface ChainStage {
  /** The validated input. A consuming stage's `sourceId` is filled at its pause. */
  input: GenerateInput;
  /** The earlier stage whose output this one reads; absent on stage 1. */
  consumes?: number;
  /** The quote the pause offers; replaced when it expires or is spent elsewhere. */
  quoteId?: string;
  /** The approval, recorded before the stage is submitted. */
  approval?: ChainApproval;
}

export interface ChainRecord {
  id: string;
  target?: OutputTargetId;
  stages: ChainStage[];
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
}

export type StageStatus =
  | "waiting"
  | "paused"
  | "submitting"
  | "running"
  | "ready"
  | "failed"
  | "cancelled";
export type ChainStatus =
  "paused" | "running" | "complete" | "failed" | "cancelled";

export interface ChainView {
  id: string;
  status: ChainStatus;
  target?: OutputTargetId;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  /** The stage waiting on approval, while the chain is paused. */
  pausedAt?: number;
  /** The live quote the pause waits on: approve with its id. */
  quote?: Quote;
  stages: {
    status: StageStatus;
    input: GenerateInput;
    consumes?: number;
    jobId?: string;
  }[];
}

/** The idempotency key a stage's job runs under; matches `IDEMPOTENCY_KEY`. */
export const chainStageKey = (chainId: string, index: number) =>
  `chain-${chainId}-${index}`;

/**
 * The structural rules `validateInput` cannot see, as a message or null.
 * `consumes` has already defaulted to the previous stage.
 */
export function chainShapeError(
  stages: readonly Pick<ChainStage, "consumes" | "input">[],
): string | null {
  if (stages.length < 1 || stages.length > MAX_CHAIN_STAGES)
    return `A chain has between one and ${MAX_CHAIN_STAGES} stages.`;
  for (const [index, { input, consumes }] of stages.entries()) {
    const name = `Stage ${index + 1}`;
    if (input.imageReferences?.length)
      return `${name}: a chain cannot hold image references, which it would store until approval.`;
    if (index === 0) {
      if (consumes !== undefined)
        return "Stage 1 reads no earlier stage: give it text or a source.";
      continue;
    }
    const reads = CONSUMES[input.generator];
    if (!reads)
      return `${name}: only an upscale can read an earlier stage today.`;
    if (
      consumes === undefined ||
      !Number.isInteger(consumes) ||
      consumes < 0 ||
      consumes >= index
    )
      return `${name}: name an earlier stage to read.`;
    const made = MAKES[stages[consumes].input.generator];
    if (made !== reads)
      return `${name} reads ${reads} output; stage ${consumes + 1} makes ${made} output.`;
    if (input.sourceId !== undefined)
      return `${name} reads stage ${consumes + 1}, so it takes no source of its own.`;
  }
  return null;
}

/**
 * An approval still waiting on its job. One older than `APPROVAL_TIMEOUT_MS`
 * with no job never reserved a run (its submission was lost), so the stage
 * reads as paused and unpaid again. A stage with a job is never recovered:
 * its run, reserved once, is never sent again.
 */
export const liveApproval = (
  stage: ChainStage,
  job: Job | undefined,
  now = Date.now(),
) =>
  !job &&
  stage.approval !== undefined &&
  now - Date.parse(stage.approval.at) <= APPROVAL_TIMEOUT_MS;

const stageOf = (job: Job): StageStatus =>
  job.status === "Ready"
    ? "ready"
    : isTerminal(job.status)
      ? "failed"
      : "running";

/** Each stage's status, from the jobs its keys found (by index). */
export function stageStatuses(
  record: ChainRecord,
  jobs: readonly (Job | undefined)[],
  now = Date.now(),
): StageStatus[] {
  let reached = true;
  return record.stages.map((stage, index) => {
    const job = jobs[index];
    const status: StageStatus = job
      ? stageOf(job)
      : liveApproval(stage, job, now)
        ? "submitting"
        : record.cancelledAt
          ? "cancelled"
          : reached
            ? "paused"
            : "waiting";
    reached = reached && status === "ready";
    return status;
  });
}

export function chainStatus(
  record: ChainRecord,
  statuses: readonly StageStatus[],
): ChainStatus {
  if (statuses.some((s) => s === "running" || s === "submitting"))
    return "running";
  if (statuses.includes("failed")) return "failed";
  if (statuses.every((s) => s === "ready")) return "complete";
  if (record.cancelledAt) return "cancelled";
  return "paused";
}

/**
 * The input stage `index` is submitted with: its own, plus the asset it reads.
 * A generated clip's asset id is its job's id (`takeOf`).
 */
export function stageInput(
  record: ChainRecord,
  index: number,
  jobs: readonly (Job | undefined)[],
): GenerateInput {
  const { input, consumes } = record.stages[index];
  if (consumes === undefined) return input;
  const source = jobs[consumes];
  if (source?.status !== "Ready")
    throw new Error(`Stage ${consumes + 1} has no ready take to read.`);
  return { ...input, sourceId: source.id };
}

/** What the owner sees: no approval bookkeeping, the quote only while live. */
export function chainView(
  record: ChainRecord,
  jobs: readonly (Job | undefined)[],
  quote?: Quote,
  now = Date.now(),
): ChainView {
  const statuses = stageStatuses(record, jobs, now);
  const status = chainStatus(record, statuses);
  const pausedAt = statuses.indexOf("paused");
  return {
    id: record.id,
    status,
    ...(record.target ? { target: record.target } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.cancelledAt ? { cancelledAt: record.cancelledAt } : {}),
    ...(status === "paused" ? { pausedAt } : {}),
    ...(status === "paused" && quote ? { quote } : {}),
    stages: record.stages.map((stage, index) => ({
      status: statuses[index],
      input: stage.input,
      ...(stage.consumes === undefined ? {} : { consumes: stage.consumes }),
      ...(jobs[index] ? { jobId: jobs[index].id } : {}),
    })),
  };
}

/** The stage an approval acts on: paused, or approved and not yet a job. */
export const approvalStage = (statuses: readonly StageStatus[]) =>
  statuses.findIndex((s) => s === "paused" || s === "submitting");

/** Whether `quoteId` already approved a stage of this chain. */
export const approvedWith = (record: ChainRecord, quoteId: string) =>
  record.stages.some((stage) => stage.approval?.quoteId === quoteId);
