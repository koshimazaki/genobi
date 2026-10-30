import type { DurationEstimate, Generator, Job, VideoModel } from "./types";

/**
 * A job's progress as one terminal line, the same in the studio and in an
 * agent's chat: `GENERATING KLEIN IMAGE  73% ⣿⣿⣿⣿⣀⣀`. The bar appears only
 * when the provider reports real progress; otherwise the line says how long
 * the job has run, never a number standing in for one.
 */

/**
 * BFL reports real progress on a polled job. It is optional, and the API has
 * used both a 0–1 fraction and a 0–100 percentage, so accept either and
 * report nothing at all rather than inventing a number: an absent value means
 * the caller should fall back to elapsed time.
 */
export function generationProgress(job: Pick<Job, "progress">) {
  const value = job.progress;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return undefined;
  const fraction = value > 1 ? value / 100 : value;
  // A finished-looking fraction on an unfinished job would read as a stall,
  // so hold just short of complete until the status itself says otherwise.
  return Math.min(fraction, 0.99);
}

/** Braille cells from empty to full, one dot pair at a time. */
const LEVELS = ["⣀", "⣄", "⣤", "⣦", "⣶", "⣷", "⣿"];

/**
 * A progress bar of `cells` braille characters: full cells `⣿`, empty `⣀`,
 * and the cell at the edge part-filled, so 73% lands inside a cell.
 */
export function brailleBar(fraction: number, cells = 28): string {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const steps = LEVELS.length - 1;
  const filled = Math.round(f * cells * steps);
  return Array.from(
    { length: cells },
    (_, i) => LEVELS[Math.min(steps, Math.max(0, filled - i * steps))],
  ).join("");
}

const VERB: Record<string, string> = {
  submitting: "SENDING",
  Pending: "QUEUED",
  Reasoning: "PLANNING",
  Generating: "GENERATING",
  copying: "SAVING",
};
const MODEL: Record<VideoModel, string> = {
  "minimax-h3": "H3",
  "minimax-h3-canny": "H3 Canny",
  "minimax-h3-depth": "H3 Depth",
  "minimax-h3-combined": "H3 Combined",
  "minimax-h3-router": "H3",
  "flux-3-i2v": "FLUX 3",
  "flux-3": "FLUX 3",
  "ltx-2.5": "LTX",
  "ltx-2.5-pro": "LTX PRO",
  "ltx-2.5-open": "LTX OPEN",
  "ltx-2.5-akuspace": "LTX ACOUSTIC",
  "flux-3-klein": "KLEIN",
  "flux-3-klein-api": "KLEIN",
  "openjutsu-swap": "SWAP",
  "minimax-music-3": "MUSIC 3",
  "seedvr2-upscale": "SEEDVR2",
};
const MEDIA: Record<Generator, string> = {
  video: "VIDEO",
  image: "IMAGE",
  edit: "IMAGE EDIT",
  upscale: "UPSCALE",
  audio: "TRACK",
};

/** What the job is doing, in capitals: `GENERATING KLEIN IMAGE`. */
export function jobStage(
  job: Pick<Job, "status" | "generator" | "model">,
): string {
  const verb = VERB[job.status] ?? job.status.toUpperCase();
  const model = job.generator === "upscale" ? "" : MODEL[job.model!];
  return [verb, model, MEDIA[job.generator]].filter(Boolean).join(" ");
}

/**
 * The line for a stage: with a fraction, the percentage and the bar; without
 * one, the elapsed seconds when known.
 */
export function progressLine(
  stage: string,
  fraction?: number,
  elapsedSeconds?: number,
  cells = 28,
): string {
  if (fraction !== undefined)
    return `${stage}  ${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}% ${brailleBar(fraction, cells)}`;
  return elapsedSeconds !== undefined
    ? `${stage}  ${Math.max(0, Math.floor(elapsedSeconds))}s`
    : stage;
}

/**
 * Router's duration estimate as words, never as a bar: the run's usual length
 * and its 90th percentile, marked when it is a default rather than measured.
 */
export function estimateText(estimate: DurationEstimate | undefined) {
  if (!estimate) return undefined;
  const typical =
    estimate.source === "historical" ? "typical" : "default estimate";
  return estimate.p90Seconds
    ? `~${estimate.seconds}s ${typical}, p90 ${estimate.p90Seconds}s`
    : `~${estimate.seconds}s ${typical}`;
}

/** A job's line at `now` (milliseconds since the epoch). */
export function jobProgressLine(
  job: Pick<
    Job,
    "status" | "generator" | "model" | "progress" | "createdAt" | "estimate"
  >,
  now = Date.now(),
): string {
  const started = Date.parse(job.createdAt);
  const fraction = generationProgress(job);
  const line = progressLine(
    jobStage(job),
    fraction,
    Number.isFinite(started) ? (now - started) / 1000 : undefined,
  );
  // Real progress says more than an estimate; the estimate fills in for none.
  const estimate = fraction === undefined && estimateText(job.estimate);
  return estimate ? `${line} · ${estimate}` : line;
}
