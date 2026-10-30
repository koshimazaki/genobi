// Upscaling a clip longer than one upscale takes: the plan that cuts it into
// parts on frame boundaries, and the set's public shape. Portable: no Node or
// DOM API. The local server cuts, runs and joins (`server/upscale-parts.ts`);
// the hosted Worker has no ffmpeg and offers no split.
import type { Job, Source } from "./types";
import type { Quote } from "./quote";

/**
 * The longest clip one upscale takes, FLUX Video Upscale's and SeedVR2's
 * alike. BFL states it ("at most 20 seconds of source footage",
 * docs.bfl.ai/flux_tools/flux_video_upscale, and Router's
 * `bfl/video-upscale-v1` schema, both checked 30 October 2026). The SeedVR2
 * graph has no length cap of its own; the studio holds it to the same 20 s
 * (`checkUpscaleLimits`, shared/mp4.ts), so one source fits either upscaler.
 */
export const UPSCALE_MAX_SECONDS = 20;
/**
 * The part length a split cuts by default: a second under the ceiling, so a
 * part whose sound runs past its picture, or whose container rounds its
 * length up, still measures under 20 s when the quote reads it.
 */
export const UPSCALE_PART_MAX_SECONDS = 19;
/**
 * The shortest part. Neither provider states a minimum (checked 30 October
 * 2026); this is the studio's own floor, so a split never sends a sliver.
 */
export const UPSCALE_PART_MIN_SECONDS = 1;
/** Parts in one set: seven of 19 s cover the media tools' two minutes. */
export const MAX_UPSCALE_PARTS = 7;
/** The longest clip a set takes, the media tools' own video limit. */
export const UPSCALE_SPLIT_MAX_SECONDS = 120;

export interface PartRange {
  index: number;
  /** The part's first frame of the source, from 0. */
  startFrame: number;
  frames: number;
  /** Seconds from the source's start, and the part's length, from frames. */
  start: number;
  duration: number;
}
export interface PartPlan {
  fps: number;
  /** The source's frame count; the parts' frames add up to it. */
  frames: number;
  parts: PartRange[];
}

export class PlanRefusal extends Error {}

/**
 * The longest clip one run of this upscaler takes where it runs: SeedVR2 on
 * a local ComfyUI has no length cap of its own (VRAM is the limit), so the
 * studio takes the local upload cap; FLUX Video Upscale and Comfy Cloud, 20 s.
 */
export const singleRunSeconds = (model: unknown, location: unknown) =>
  model === "seedvr2-upscale" && location === "local"
    ? UPSCALE_SPLIT_MAX_SECONDS
    : UPSCALE_MAX_SECONDS;

/**
 * What the composer offers beside a clip: a split it needs (past one run's
 * length), a split it may choose (local SeedVR2 past 20 s, to spare VRAM), or
 * none.
 */
export function splitOffer(
  source: Pick<Source, "duration">,
  model: unknown,
  location: unknown,
): "required" | "optional" | undefined {
  if (source.duration > singleRunSeconds(model, location)) return "required";
  return source.duration > UPSCALE_MAX_SECONDS ? "optional" : undefined;
}

/** Whether a source is too long for one upscale. */
export const needsParts = (source: Pick<Source, "duration">) =>
  source.duration > UPSCALE_MAX_SECONDS;

/**
 * Full parts of `partSeconds` on frame boundaries, then the remainder (23.125 s
 * at 24 fps: 456 + 99 frames). A remainder under the 1 s minimum joins the
 * part before it when that part stays within `maxSeconds`; otherwise the last
 * two parts share their frames as evenly as whole frames allow.
 */
export function planParts(
  frames: number,
  fps: number,
  partSeconds = UPSCALE_PART_MAX_SECONDS,
  maxSeconds = UPSCALE_MAX_SECONDS,
): PartPlan {
  if (!Number.isInteger(frames) || frames < 1)
    throw new PlanRefusal("The clip's frame count could not be read.");
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240)
    throw new PlanRefusal("The clip's frame rate could not be read.");
  const full = Math.floor(partSeconds * fps);
  const most = Math.floor(maxSeconds * fps);
  const least = Math.ceil(UPSCALE_PART_MIN_SECONDS * fps);
  if (full < least || full > most)
    throw new PlanRefusal(
      `Choose a part length from ${UPSCALE_PART_MIN_SECONDS} to ${maxSeconds} seconds.`,
    );
  const lengths: number[] = [];
  for (let left = frames; left > 0; left -= full)
    lengths.push(Math.min(full, left));
  const tail = lengths[lengths.length - 1];
  if (lengths.length > 1 && tail < least) {
    lengths.pop();
    const last = lengths.pop()!;
    if (last + tail <= most) lengths.push(last + tail);
    else {
      const both = last + tail;
      lengths.push(Math.ceil(both / 2), Math.floor(both / 2));
    }
  }
  if (lengths.length > MAX_UPSCALE_PARTS)
    throw new PlanRefusal(
      `Split upscales take up to ${MAX_UPSCALE_PARTS} parts. Trim this clip or choose longer parts.`,
    );
  const parts: PartRange[] = [];
  let startFrame = 0;
  lengths.forEach((length, index) => {
    parts.push({
      index,
      startFrame,
      frames: length,
      start: startFrame / fps,
      duration: length / fps,
    });
    startFrame += length;
  });
  return { fps, frames, parts };
}

/** The set's price: every part's quote added, rounded like a quote. */
export const combinedUsd = (quotes: Pick<Quote, "estimateUsd">[]) =>
  Math.round(quotes.reduce((sum, quote) => sum + quote.estimateUsd, 0) * 1e6) /
  1e6;

/** One part as the studio and agents see it. */
export interface PartView extends PartRange {
  /** The cut, a derived source in the session; what the part's job upscales. */
  sourceId: string;
  /** The part's run, once it is reserved; absent before. */
  job?: Job;
  /**
   * The part's job failed in a way that may still have been charged (a
   * submission whose acceptance was never recorded). It is never resent on
   * its own; a retry is the person's explicit, newly quoted choice.
   */
  uncertain?: true;
  /** Why the part was refused before anything was sent, when it was. */
  refused?: string;
  /** A retry's quote, waiting for the person's confirmation. */
  retryQuote?: Quote;
}

export type PartSetStatus =
  | "quoted"
  | "running"
  | "joining"
  | "joined"
  | "failed"
  /** The person declined the agent's request for it; it can never run. */
  | "declined";

/** The set: what one confirmation covers, and where it stands. */
export interface PartSetView {
  id: string;
  sourceId: string;
  model: string;
  upscaleFactor: number;
  upscaleCreativity: 0 | 1;
  upscalePrompt?: string;
  /** The length each full part is cut to. */
  partSeconds: number;
  status: PartSetStatus;
  plan: PartPlan;
  parts: PartView[];
  /** The confirmation id covering every part, sent back as `Quote-Id`. */
  quoteId: string;
  /** Every part's estimate, added; what the one confirmation agrees to. */
  estimateUsd: number;
  /** The soonest any part's quote expires; ask for a new quote after it. */
  expiresAt: string;
  confirmed: boolean;
  /** The joined clip, once every part is ready and joined. */
  joined?: Source;
  joinError?: string;
}

/** The idempotency key a part's run uses; matches `IDEMPOTENCY_KEY`. */
export const partKey = (setId: string, index: number, attempt: number) =>
  `parts-${setId}-${index}-${attempt}`;
