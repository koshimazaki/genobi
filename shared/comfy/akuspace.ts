import type { AspectRatio, VideoResolution } from "../types";
import { LTX_WORKFLOW_FPS, ltxWorkflowSize } from "./ltx-frame";
import type { ApiGraph } from "./slots";
import { VIDEO_OUTPUT, type WorkflowTemplate } from "./workflow";
import akuspaceGraph from "../../workflows/ltx-2-5-akuspace-t2v.json";
import ltxGraph from "../../workflows/ltx-2-5-t2v.json";

/**
 * The loaders both LTX graphs share, as model slots. Filled only on a local
 * ComfyUI, from the operator's model map (`shared/comfy/local-models.ts`);
 * Comfy Cloud keeps the catalogue names written in the graph.
 */
const LTX_MODEL_SLOTS = {
  unet_name: { path: "398:384.unet_name", kind: "model" },
  text_encoder: { path: "398:387.clip_name", kind: "model" },
  prompt_encoder: { path: "398:393.clip_name", kind: "model" },
  video_vae: { path: "398:385.vae_name", kind: "model" },
  audio_vae: { path: "398:386.vae_name", kind: "model" },
  latent_upscaler: { path: "398:371.model_name", kind: "model" },
} as const;

/**
 * LTX-2.5 text-to-video with the AKUSPACE LoRA: Comfy Cloud's LTX-2.5 template
 * switched to text to video, with one core `LoraLoaderModelOnly` between the
 * UNET and both guiders. The treatment is already in the prompt
 * (`shared/acoustic.ts`), so Cloud needs no custom node. See
 * `workflows/ltx-2-5-akuspace-t2v.README.md`.
 */
export const akuspaceWorkflow: WorkflowTemplate = {
  id: "ltx-2-5-akuspace-t2v",
  file: "workflows/ltx-2-5-akuspace-t2v.json",
  graph: akuspaceGraph as ApiGraph,
  slots: {
    prompt: { path: "398:376.value", kind: "text" },
    duration: { path: "398:362.value", kind: "number" },
    fps: { path: "398:361.value", kind: "number" },
    width: { path: "398:372.value", kind: "number" },
    height: { path: "398:360.value", kind: "number" },
    lora_strength: { path: "900.strength_model", kind: "number" },
    seed: { path: "398:339.noise_seed", kind: "number" },
    refine_seed: { path: "398:338.noise_seed", kind: "number" },
    ...LTX_MODEL_SLOTS,
    lora_name: { path: "900.lora_name", kind: "model" },
  },
  requiredNodes: ["LoraLoaderModelOnly"],
  requiredModels: ["akuspace-ltx25-v0.5.safetensors"],
  output: VIDEO_OUTPUT,
};

/** Aligned final dimensions, 24 fps and integer seconds guarantee 8n+1 frames. */
export function akuspaceValues(
  input: {
    duration: number;
    aspectRatio: AspectRatio;
    resolution: VideoResolution;
  },
  prompt: string,
  random: () => number = Math.random,
) {
  const seed = () => Math.floor(random() * 2 ** 48);
  return {
    prompt,
    duration: input.duration,
    fps: LTX_WORKFLOW_FPS,
    ...ltxWorkflowSize(input.aspectRatio, input.resolution),
    lora_strength: 1,
    seed: seed(),
    refine_seed: seed(),
  };
}

/**
 * The same LTX-2.5 graph without the LoRA (`workflows/ltx-2-5-t2v.json`). It
 * takes every Acoustic Space value but the LoRA's strength; the treatment
 * still reaches it in the prompt, so it can stand behind Acoustic Space where
 * the LoRA is not installed, and behind a plain text-to-video entry later.
 */
export const ltxWorkflow: WorkflowTemplate = {
  id: "ltx-2-5-t2v",
  file: "workflows/ltx-2-5-t2v.json",
  graph: ltxGraph as ApiGraph,
  slots: Object.fromEntries(
    Object.entries(akuspaceWorkflow.slots).filter(
      ([name]) => name !== "lora_strength" && name !== "lora_name",
    ),
  ),
  requiredNodes: [],
  requiredModels: [],
  output: VIDEO_OUTPUT,
};

/** `akuspaceValues` for the graph without the LoRA. */
export function ltxValues(
  ...args: Parameters<typeof akuspaceValues>
): Record<string, unknown> {
  const { lora_strength: _strength, ...values } = akuspaceValues(...args);
  return values;
}
