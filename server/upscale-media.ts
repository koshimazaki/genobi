// The free, local half of a split upscale: measure the source, cut it into
// its planned parts, and join the upscaled parts back with the source's own
// sound. Each file is made by the media tools (`server/media-tools.ts`), one
// ffmpeg at a time, measured by the shared readers and saved as a derived
// source the session owns. Nothing here is paid.
import { AppError } from "./errors";
import { frameCount, partArgs } from "./ffmpeg-parts";
import type { MediaTools } from "./media-tools";
import { discardPlan } from "./upscale-parts-view";
import {
  planParts,
  PlanRefusal,
  UPSCALE_SPLIT_MAX_SECONDS,
  type PartPlan,
} from "../shared/upscale-parts";
import { isVideoSource, type Source } from "../shared/types";

type Resolved = { source: Source; file: string };

/** Measures the source with ffprobe and plans its parts; nothing is written. */
export async function planSource(
  tools: MediaTools,
  from: Resolved,
  limits: { partSeconds: number; maxSeconds: number },
) {
  if (!isVideoSource(from.source))
    throw new AppError(400, "Choose a video to upscale.");
  if (from.source.duration > UPSCALE_SPLIT_MAX_SECONDS)
    throw new AppError(
      400,
      `Split upscales take clips up to ${UPSCALE_SPLIT_MAX_SECONDS} seconds. Trim this clip first.`,
      "upscale_too_long",
    );
  await tools.require();
  const probe = await tools.probeFile(from.file);
  const frames = frameCount(probe, from.source.duration);
  try {
    return {
      probe,
      plan: planParts(
        frames ?? 0,
        probe.video?.fps ?? 0,
        limits.partSeconds,
        limits.maxSeconds,
      ),
    };
  } catch (error) {
    if (error instanceof PlanRefusal)
      throw new AppError(400, error.message, "upscale_parts_refused");
    throw error;
  }
}

/**
 * Cuts the planned parts, in order, each a derived `trim` of the source. A
 * cut that fails takes back the parts already made, files included.
 */
export async function cutParts(
  tools: Pick<MediaTools, "probeFile" | "produce" | "store">,
  from: Resolved,
  plan: PartPlan,
  sessionId: string,
) {
  const probe = await tools.probeFile(from.file);
  const sources: Source[] = [];
  try {
    for (const part of plan.parts)
      sources.push(
        await tools.produce(
          "video",
          [from],
          sessionId,
          "trim",
          (out) =>
            partArgs.cut(
              from.file,
              probe,
              part.startFrame,
              part.frames,
              plan.fps,
              out,
            ),
          `Part ${part.index + 1} of ${plan.parts.length} · ${from.source.label}`,
        ),
      );
  } catch (error) {
    await discardPlan(
      tools.store,
      sources.map((source) => source.id),
      [],
    );
    throw error;
  }
  return sources;
}

/**
 * The upscaled parts joined in order with the original's sound, recorded as a
 * `concat` of the parts and the original (its sound), in that order.
 */
export async function joinParts(
  tools: MediaTools,
  parts: Resolved[],
  original: Resolved,
  plan: PartPlan,
  sessionId: string,
) {
  await tools.require();
  const first = await tools.probeFile(parts[0].file);
  if (!first.video)
    throw new AppError(400, "ffmpeg found no picture in an upscaled part.");
  const probe = await tools.probeFile(original.file);
  return tools.produce(
    "video",
    [...parts, original],
    sessionId,
    "concat",
    (out) =>
      partArgs.join(
        parts.map((part, i) => ({
          file: part.file,
          frames: plan.parts[i].frames,
        })),
        first,
        { file: original.file, probe },
        plan.fps,
        out,
      ),
    `Upscaled ${original.source.label}`,
  );
}
