import { AppError } from "../server/errors";
import { isComfyKey } from "./provider";
import type { GenerateInput } from "./types";

/**
 * The FLUX Video Upscale request, one shape for both providers and both
 * adapters. BFL direct takes it at `POST /v1/flux-tools/video-upscale-v1`
 * (docs.bfl.ai, checked 19 September 2026); Comfy Router lists the same
 * upscaler as `bfl/video-upscale-v1`
 * (docs.comfy.org/router-schemas/bfl/video-upscale-v1.json, checked
 * 23 October 2026): `input_video`, an http(s) URL or a base64 MP4 of at most
 * 20 seconds and 50 MB (`checkUpscaleLimits` holds both ceilings);
 * `upscale_factor` 1.5–3; `creativity` 0 or 1; an optional `prompt`; and
 * `safety_tolerance` 0–4. Router's schema declares no `user` field, so a
 * Comfy key sends none. The webhook fields are never sent: both adapters poll.
 */
export function upscaleBody(
  input: Pick<GenerateInput, "upscaleFactor" | "upscaleCreativity">,
  prompt: string,
  /** The source: a lent https URL (hosted) or the MP4's bytes in base64 (local). */
  inputVideo: string,
  key: string,
  session: string,
) {
  const factor = input.upscaleFactor;
  const creativity = input.upscaleCreativity ?? 0;
  // The request validators check these first; this keeps a body that the
  // provider would refuse from ever being sent, whichever caller built it.
  if (!Number.isFinite(factor) || factor < 1.5 || factor > 3)
    throw new AppError(400, "Choose an upscale amount between 1.5× and 3×.");
  if (creativity !== 0 && creativity !== 1)
    throw new AppError(400, "Choose Precise or Creative upscaling.");
  if (!inputVideo) throw new AppError(400, "Choose a video to upscale.");
  return {
    input_video: inputVideo,
    upscale_factor: factor,
    creativity,
    ...(prompt ? { prompt } : {}),
    safety_tolerance: 2,
    ...(isComfyKey(key) ? {} : { user: session }),
  };
}
