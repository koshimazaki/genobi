import type { AspectRatio, VideoResolution } from "../types";

export const LTX_WORKFLOW_FPS = 24;
/** LTX's temporal latent needs 8n+1 frames. Whole seconds at 24 fps fit exactly. */
export const ltxFrames = (seconds: number, fps = LTX_WORKFLOW_FPS) =>
  Math.ceil((seconds * fps) / 8) * 8 + 1;

/**
 * The shipped workflow starts at half size and doubles its latent. Its first
 * stage needs multiples of 32, so final dimensions are multiples of 64.
 * Keep the tier's pixel budget across shapes, with the actual size shown in UI.
 */
export function ltxWorkflowSize(
  aspect: AspectRatio,
  resolution: VideoResolution,
) {
  const pixels = {
    hd: 1280 * 720,
    fhd: 1920 * 1080,
    qhd: 2560 * 1440,
    uhd: 3840 * 2160,
  }[resolution];
  const [w, h] = aspect.split(":").map(Number);
  const snap = (n: number) => Math.max(64, Math.round(n / 64) * 64);
  return {
    width: snap(Math.sqrt((pixels * w) / h)),
    height: snap(Math.sqrt((pixels * h) / w)),
  };
}
