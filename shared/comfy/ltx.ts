import type { AspectRatio, VideoModel, VideoResolution } from "../types";

/**
 * LTX-2.5 through Comfy Router, checked against
 * docs.comfy.org/router-schemas/ltx/ltx-2-5-fast.json on 10 October 2026:
 * `prompt` (≤ 10000), `duration` from a fixed list of seconds, `resolution`
 * as WxH from a fixed list, `fps` 24/25/48/50, `generate_audio` (default true).
 * Router accepts nothing else, so the body is built here and nowhere else.
 */
export const LTX_DURATIONS = [
  2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20,
] as const;
export type LtxResolution =
  | "1280x720"
  | "720x1280"
  | "1920x1080"
  | "1080x1920"
  | "2560x1440"
  | "1440x2560"
  | "3840x2160"
  | "2160x3840";

/** The nearest duration LTX accepts; ties go to the shorter, cheaper clip. */
export function ltxDuration(seconds: number): (typeof LTX_DURATIONS)[number] {
  return LTX_DURATIONS.reduce((best, item) =>
    Math.abs(item - seconds) < Math.abs(best - seconds) ? item : best,
  );
}

/** LTX takes 16:9 or 9:16 only; wider or squarer ratios fall to the landscape frame. */
export function ltxResolution(
  aspect: AspectRatio,
  resolution: VideoResolution,
): LtxResolution {
  const portrait = aspect === "9:16" || aspect === "3:4";
  const sizes: Record<VideoResolution, [LtxResolution, LtxResolution]> = {
    hd: ["1280x720", "720x1280"],
    fhd: ["1920x1080", "1080x1920"],
    qhd: ["2560x1440", "1440x2560"],
    uhd: ["3840x2160", "2160x3840"],
  };
  return sizes[resolution][portrait ? 1 : 0];
}

export function ltxBody(
  input: {
    duration: number;
    aspectRatio: AspectRatio;
    resolution: VideoResolution;
  },
  prompt: string,
) {
  return {
    prompt,
    duration: ltxDuration(input.duration),
    resolution: ltxResolution(input.aspectRatio, input.resolution),
    fps: 25,
    // Audio is not a choice in the studio: every run asks for it.
    generate_audio: true,
  };
}

/**
 * Comfy partner-node rates, docs.comfy.org/tutorials/partner-nodes/pricing,
 * October 2026, credits per second of output. Pro at 1440p and 4K is not
 * listed: it is scaled from Fast by the 720p ratio and shown as an estimate.
 * Acoustic Space runs on Comfy Cloud, billed by GPU time rather than these
 * rates; until the phase 4 cost formula it is estimated at Fast's rate.
 */
const CREDITS_PER_SECOND: Record<
  VideoResolution,
  { fast: number; pro: number }
> = {
  hd: { fast: 27.16, pro: 36.21 },
  fhd: { fast: 39.22, pro: 51.29 },
  qhd: { fast: 57.33, pro: 57.33 * (36.21 / 27.16) },
  uhd: { fast: 90.52, pro: 90.52 * (36.21 / 27.16) },
};
/** Comfy Standard plan: $20 buys 4,200 credits (Comfy pricing page, October 2026). Approximate. */
export const CREDITS_PER_USD = 210;

export function estimateVideoCredits(
  model: VideoModel,
  duration: number,
  resolution: VideoResolution,
): number {
  const tier = model === "ltx-2.5-pro" ? "pro" : "fast";
  return (
    Math.round(
      (model === "ltx-2.5-open" || model === "ltx-2.5-akuspace"
        ? duration
        : ltxDuration(duration)) *
        CREDITS_PER_SECOND[resolution][tier] *
        100,
    ) / 100
  );
}
export const isLtx = (model: VideoModel | undefined) =>
  model === "ltx-2.5" ||
  model === "ltx-2.5-pro" ||
  model === "ltx-2.5-akuspace" ||
  model === "ltx-2.5-open";
