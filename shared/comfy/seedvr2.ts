import graph from "../../workflows/seedvr2-upscale.json";
import { AppError } from "../../server/errors";
import { estimateUpscaleOutput, estimateUpscaleUsd } from "../presets";
import type { GenerateInput, Source, VideoModel } from "../types";
import type { ApiGraph } from "./slots";
import { unsent, type WorkflowFile, type WorkflowTemplate } from "./workflow";

/**
 * SeedVR2 video upscaling, the open upscaler: Comfy's official
 * `utility_seedvr2_3b_int8_upscale_video` template (Comfy-Org/workflow_templates,
 * MIT, commit e7cd011) in API format, its one subgraph flattened into nodes
 * `66:*` by comfy-cli's own converter, every node and value kept. The weights
 * are ByteDance Seed's SeedVR2-3B, repackaged by Comfy-Org (Apache-2.0). Only
 * core ComfyUI nodes, so it runs on Comfy Cloud and on a local ComfyUI 0.43 or
 * later with no custom pack. See `workflows/seedvr2-upscale.README.md`.
 */
export const SEEDVR2_MODEL = "seedvr2-upscale" satisfies VideoModel;
export const isSeedvr2 = (model: unknown): model is "seedvr2-upscale" =>
  model === SEEDVR2_MODEL;

export const seedvr2Workflow: WorkflowTemplate = {
  id: "seedvr2-upscale",
  file: "workflows/seedvr2-upscale.json",
  graph: graph as ApiGraph,
  slots: {
    video: { path: "73.file", kind: "video" },
    // The template's `scale_multiplier` (default 2).
    scale: { path: "66:57.resize_type.multiplier", kind: "number" },
    seed: { path: "66:54.seed", kind: "number" },
    // Model slots are filled only for a local ComfyUI, from its model map.
    unet_name: { path: "66:52.unet_name", kind: "model" },
    vae: { path: "66:51.vae_name", kind: "model" },
  },
  requiredNodes: [
    "SeedVR2Preprocess",
    "SeedVR2Conditioning",
    "SeedVR2PostProcessing",
    "SeedVR2TemporalChunk",
    "SeedVR2TemporalMerge",
    "ResizeImageMaskNode",
    "ComfySwitchNode",
  ],
  // Comfy Cloud's asset catalogue lists both under these names (checked
  // 29 October 2026); they are also the template's own.
  requiredModels: [
    graph["66:52"].inputs.unet_name,
    graph["66:51"].inputs.vae_name,
  ],
  output: { nodeId: "76", media: "video" },
};

/**
 * The largest frame SeedVR2 is asked for: FLUX Video Upscale's own output
 * ceiling, 13.75 megapixels, so the open run is never sent a frame the paid
 * one would refuse to make, nor one past a 4K-class VRAM budget.
 */
export const SEEDVR2_MAX_PIXELS = 13.75 * 1048576;

/**
 * Refuses, before a quote or a reservation, a source the chosen amount would
 * take past the frame ceiling, naming the largest amount that fits. FLUX
 * lowers its own factor silently; a graph is sent exactly the amount the take
 * records, so SeedVR2 asks for a smaller one instead.
 */
export function requireSeedvr2Fit(
  source: Pick<Source, "width" | "height">,
  factor: number,
) {
  const { capped, effectiveFactor } = estimateUpscaleOutput(source, factor);
  if (!capped) return;
  const most = Math.floor(effectiveFactor * 10) / 10;
  throw new AppError(
    400,
    most >= 1.5
      ? `SeedVR2 makes at most 13.75 megapixels a frame: choose ${most}× or less for this clip.`
      : "This clip is too large for SeedVR2 to upscale 1.5×. Choose a smaller clip.",
    "upscale_too_large",
  );
}

/**
 * The values the SeedVR2 graph's slots receive: the amount, and a fresh seed
 * (the template's KSampler range is 64-bit; 2^48 keeps it an exact JS number).
 * The trim, latent split and colour correction keep the template's values.
 */
export function seedvr2Values(
  input: Pick<GenerateInput, "upscaleFactor">,
  random: () => number = Math.random,
) {
  const scale = input.upscaleFactor;
  if (!Number.isFinite(scale) || scale < 1 || scale > 3)
    throw unsent("Choose an upscale amount between 1.5× and 3×.");
  return { scale, seed: Math.floor(random() * 2 ** 48) };
}

/** The one input file: the source MP4, after ownership checks and reservation. */
export function seedvr2Files(video: Uint8Array): Record<string, WorkflowFile> {
  if (!video.length || video.length > 50_000_000)
    throw unsent("SeedVR2 needs an MP4 under 50 MB.");
  return { video: { bytes: video, contentType: "video/mp4" } };
}

/**
 * The estimate a Comfy Cloud run reserves. Cloud bills an open graph by GPU
 * time, at a rate Genobi does not know, so it is held at FLUX Video Upscale's
 * Precise rate, as the open Klein graph is held at BFL's Klein price. A local
 * ComfyUI is free and quoted at zero by the adapter.
 */
export const estimateSeedvr2Usd = (
  source: Pick<Source, "width" | "height" | "duration">,
  factor: number,
) => estimateUpscaleUsd(source, factor, 0);
