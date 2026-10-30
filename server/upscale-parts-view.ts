// The split upscale's read side and planning rules (`server/upscale-parts.ts`):
// what a set shows, the part length a run may use, and the request a set is
// reused for. No side effects beyond the cut rollback.
import { unlink } from "node:fs/promises";
import { isSeedvr2 } from "../shared/comfy/seedvr2";
import { publicQuote } from "../shared/quote";
import { isTerminal, type GenerateInput, type Job } from "../shared/types";
import {
  combinedUsd,
  UPSCALE_MAX_SECONDS,
  UPSCALE_PART_MAX_SECONDS,
  UPSCALE_SPLIT_MAX_SECONDS,
  type PartSetStatus,
  type PartSetView,
  type PartView,
} from "../shared/upscale-parts";
import { AppError } from "./errors";
import {
  publicJob,
  publicSource,
  type Store,
  type StoredJob,
  type StoredPartSet,
  type StoredQuote,
} from "./store";

export const failed = (job: Job | undefined) =>
  Boolean(job && isTerminal(job.status) && job.status !== "Ready");
/** An error whose acceptance was never recorded: it may have been charged. */
export const uncertain = (job: StoredJob) =>
  job.status === "Error" && !job.providerId && job.costActualUsd !== 0;

export function setStatus(
  set: StoredPartSet,
  jobs: (Job | undefined)[],
): PartSetStatus {
  if (!set.confirmation) return "quoted";
  if (set.joinedSourceId) return "joined";
  if (set.joinError) return "failed";
  if (set.parts.some((part, i) => part.refused || failed(jobs[i])))
    return "failed";
  return jobs.every((job) => job?.status === "Ready") ? "joining" : "running";
}

/** The set as the studio and agents read it: no keys, no provider ids. */
export function setView(
  store: Store,
  set: StoredPartSet,
  jobs: (StoredJob | undefined)[],
  quote: (id: string | undefined) => StoredQuote | undefined,
  live: (id: string | undefined) => StoredQuote | undefined,
): PartSetView {
  const quotes = set.parts.map((part) => quote(part.quoteId));
  const expiry = quotes.map((q) => (q ? Date.parse(q.expiresAt) : 0));
  const joined = set.joinedSourceId
    ? store.data.sources.find(
        (s) => s.id === set.joinedSourceId && s.sessionId === set.sessionId,
      )
    : undefined;
  const parts: PartView[] = set.parts.map((part, i) => {
    const job = jobs[i];
    const retry = live(part.retry?.quoteId);
    return {
      ...set.plan.parts[i],
      sourceId: part.sourceId,
      ...(job ? { job: publicJob(job) } : {}),
      ...(job && uncertain(job) ? { uncertain: true as const } : {}),
      ...(part.refused ? { refused: part.refused } : {}),
      ...(retry && !part.retry?.claimId
        ? { retryQuote: publicQuote(retry) }
        : {}),
    };
  });
  return {
    id: set.id,
    sourceId: set.sourceId,
    model: set.input.model ?? "flux-3",
    upscaleFactor: set.input.upscaleFactor,
    upscaleCreativity: set.input.upscaleCreativity ?? 0,
    ...(set.input.upscalePrompt
      ? { upscalePrompt: set.input.upscalePrompt }
      : {}),
    partSeconds: set.partSeconds ?? UPSCALE_PART_MAX_SECONDS,
    status: set.declined ? "declined" : setStatus(set, jobs),
    plan: set.plan,
    parts,
    quoteId: set.quoteId,
    estimateUsd: combinedUsd(
      quotes.map((q) => ({ estimateUsd: q?.estimateUsd ?? 0 })),
    ),
    expiresAt: new Date(Math.min(...expiry)).toISOString(),
    confirmed: Boolean(set.confirmation),
    ...(joined ? { joined: publicSource(joined) } : {}),
    ...(set.joinError ? { joinError: set.joinError } : {}),
  };
}

export interface PartLimits {
  /** The length each full part is cut to. */
  partSeconds: number;
  /** The longest part the run takes. */
  maxSeconds: number;
}

/**
 * The part length a run may use. SeedVR2 on a local ComfyUI (this machine or
 * one on the LAN) has no length cap of its own: VRAM is the limit, so the
 * person may raise the part length up to the local upload cap, or send 0 for
 * the whole clip in one part. FLUX Video Upscale and Comfy Cloud keep 19 s
 * parts under the 20 s ceiling.
 */
export function partLimits(
  value: unknown,
  input: GenerateInput,
  location: string | undefined,
): PartLimits {
  const open = isSeedvr2(input.model) && location === "local";
  if (value === undefined || value === UPSCALE_PART_MAX_SECONDS)
    return {
      partSeconds: UPSCALE_PART_MAX_SECONDS,
      maxSeconds: open ? UPSCALE_SPLIT_MAX_SECONDS : UPSCALE_MAX_SECONDS,
    };
  if (!open)
    throw new AppError(
      400,
      "The part length is a setting of SeedVR2 on a local ComfyUI. FLUX Video Upscale and Comfy Cloud take 19 s parts.",
      "part_length_fixed",
    );
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (value !== 0 && (value < 1 || value > UPSCALE_SPLIT_MAX_SECONDS))
  )
    throw new AppError(
      400,
      `Choose a part length from 1 to ${UPSCALE_SPLIT_MAX_SECONDS} seconds, or 0 for the whole clip.`,
      "part_length_invalid",
    );
  return {
    partSeconds: value === 0 ? UPSCALE_SPLIT_MAX_SECONDS : value,
    maxSeconds: UPSCALE_SPLIT_MAX_SECONDS,
  };
}

/**
 * What a set is reused for: every field the provider receives (the validated
 * request, prompt included), the part length and the run location. Any
 * difference plans a new set, so a confirmation never sends replaced text.
 */
export const requestKey = (
  input: GenerateInput,
  limits: PartLimits,
  location: string | undefined,
) => JSON.stringify({ input, limits, location: location ?? null });

/** Takes back the cuts and quotes of a plan that could not become a set. */
export async function discardPlan(
  store: Store,
  sourceIds: string[],
  quoteIds: string[],
) {
  const cuts = store.data.sources.filter((s) => sourceIds.includes(s.id));
  store.data.sources = store.data.sources.filter(
    (s) => !sourceIds.includes(s.id),
  );
  store.data.quotes = store.data.quotes.filter(
    (q) => !quoteIds.includes(q.id) || q.jobId,
  );
  await store.save();
  await Promise.all(cuts.map((cut) => unlink(cut.filePath).catch(() => {})));
}
