import { estimateUpscaleOutput, estimateUpscaleUsd } from "./presets";
import {
  outputTargets,
  SHORT_EDGE,
  UPSCALE_FACTOR,
  upscaleStep,
  type OutputTargetId,
} from "./output-targets";
import type { Source } from "./types";

/**
 * The review step's target choice for a take that already exists. A chain's
 * output target shapes its video stage before it runs (`resolveTarget`); a
 * reviewed draft has run, so its frame is fixed and only an upscale can follow.
 * The upscaler keeps the frame's ratio, so a target with another ratio is
 * refused here rather than promised.
 */
export type TakeUpscale =
  | {
      ok: true;
      /** The amount `validateInput` accepts: 1.5, 2, 2.5 or 3. */
      factor: number;
      /** The short edge the upscale finishes on, in pixels. */
      shortEdge: number;
      /** The same estimate the quote will price, from the measured take. */
      estimateUsd: number;
    }
  | { ok: false; reason: string };

const RATIO: Record<OutputTargetId, number> = {
  phone: 9 / 16,
  social: 1,
  "1080p": 16 / 9,
  "big-screen": 16 / 9,
};

/** A measured frame within 2% of the target's ratio counts as that ratio. */
export const sameRatio = (id: OutputTargetId, width: number, height: number) =>
  Math.abs(width / height / RATIO[id] - 1) <= 0.02;

export function takeUpscale(
  id: OutputTargetId,
  take: Pick<Source, "width" | "height" | "duration">,
): TakeUpscale {
  const target = outputTargets[id];
  if (!(take.width > 0 && take.height > 0))
    return { ok: false, reason: "This take has no measured frame yet." };
  if (!sameRatio(id, take.width, take.height))
    return {
      ok: false,
      reason: `${target.label} is ${target.aspectRatio}; an upscale keeps this take's frame.`,
    };
  const edge = Math.min(take.width, take.height);
  let factor: number;
  if (target.largest) {
    const reach = estimateUpscaleOutput(take, UPSCALE_FACTOR.max);
    factor = upscaleStep(reach.effectiveFactor);
    if (reach.effectiveFactor < UPSCALE_FACTOR.min)
      return { ok: false, reason: "This take is already at the largest size." };
  } else {
    const wanted = SHORT_EDGE[target.resolution];
    if (edge >= wanted)
      return {
        ok: false,
        reason: `This take already reaches ${target.label}.`,
      };
    factor = upscaleStep(wanted / edge);
  }
  const output = estimateUpscaleOutput(take, factor);
  return {
    ok: true,
    factor,
    shortEdge: Math.min(output.width, output.height),
    estimateUsd: estimateUpscaleUsd(take, factor),
  };
}
