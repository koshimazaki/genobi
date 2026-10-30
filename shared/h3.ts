import { imageReference } from "./image";
import { isH3Router } from "./comfy/h3-router";
import type { GenerateInput } from "./types";
import type { WorkflowFile } from "./comfy/workflow";

/** The four guided Cloud OmniRef entries; H3 on Router is `isH3Router`. */
export const isH3 = (model: unknown) =>
  model === "minimax-h3" ||
  model === "minimax-h3-canny" ||
  model === "minimax-h3-depth" ||
  model === "minimax-h3-combined";

/**
 * Video models that take image references with the prompt: OmniRef's identity
 * and look, H3 on Router's sheet and storyboard, FLUX image-to-video's frames,
 * and the Openjutsu swap's character and optional first frame.
 */
export const takesVideoReferences = (model: unknown) =>
  isH3(model) ||
  isH3Router(model) ||
  model === "flux-3-i2v" ||
  model === "openjutsu-swap";
/** How many: both H3 paths and the swap take two, FLUX image-to-video ten. */
export const videoReferenceLimit = (model: unknown) =>
  isH3(model) || isH3Router(model) || model === "openjutsu-swap" ? 2 : 10;

/**
 * Models that need media a prompt alone cannot supply: H3's guide video and
 * references, FLUX 3 image-to-video's start image, and the swap's clip and
 * character.
 */
export const needsSourceMedia = takesVideoReferences;

/** Comfy Cloud credits per active GPU second, as the H3 estimate counts them. */
export const CLOUD_CREDITS_PER_GPU_SECOND = 0.266;
/** Budget estimate, not a cap: 240 active GPU seconds at 0.266 credits/s.
 * Three completed reference runs used 115–123s; preprocessing/queue conditions vary.
 */
export const H3_ESTIMATE_CREDITS = 240 * CLOUD_CREDITS_PER_GPU_SECOND;
/** Combined has not been benchmarked; provisional 480s allowance, never a cap. */
export const h3EstimateCredits = (model: unknown) =>
  H3_ESTIMATE_CREDITS * (model === "minimax-h3-combined" ? 2 : 1);

/** Called after ownership checks and durable reservation; never uses a user URL. */
export function h3Files(
  input: GenerateInput,
  video: Uint8Array,
): Record<string, WorkflowFile> {
  const refs = input.imageReferences ?? [];
  if (refs.length !== 2 || !video.length || video.length > 50_000_000)
    throw new Error("H3 needs two images and an MP4 guide under 50 MB.");
  const image = (ref: string): WorkflowFile => {
    const { bytes, metadata } = imageReference(ref);
    return {
      bytes,
      contentType: metadata.contentType as WorkflowFile["contentType"],
    };
  };
  return {
    identity: image(refs[0]),
    look: image(refs[1]),
    guide: { bytes: video, contentType: "video/mp4" },
  };
}
