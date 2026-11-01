import type { GenerateInput } from "../types";
import { readLayout } from "../image-layout";
import type { ApiGraph } from "./slots";
import { kleinWorkflow, kleinValues } from "./klein";
import { kleinEditValues } from "./klein-edit";
import type { WorkflowTemplate } from "./workflow";
import baseT2i from "../../workflows/flux-3-klein-base-t2i.json";
import baseEdit from "../../workflows/flux-3-klein-base-edit.json";

/**
 * API-form graphs normalized from the two FLUX 3 Klein Base workflows supplied
 * for Comfy Cloud. They are deliberately separate from the distilled graph:
 * T2I uses 50 steps / CFG 3.5, while Base image edits use 50 steps / CFG 1.
 * The edit graph preserves the image-aware TextGenerate upsampler.
 */
export const kleinBaseWorkflow: WorkflowTemplate = {
  id: "flux-3-klein-base-t2i",
  file: "workflows/flux-3-klein-base-t2i.json",
  graph: baseT2i as ApiGraph,
  slots: { ...kleinWorkflow.slots },
  requiredNodes: [
    "UNETLoader",
    "TextGenerate",
    "ComfySwitchNode",
    "StringConcatenate",
    "EmptyFlux2LatentImage",
  ],
  requiredModels: [
    "flux3-image-klein-base-int8-convrot.safetensors",
    "qwen3vl_4b_int8_convrot.safetensors",
    "qwen3.5_9b_flux3_prompt_upsampler_w4a8.safetensors",
    "flux2-vae.safetensors",
  ],
  output: { nodeId: "9", media: "image" },
};

/** Base text-to-image uses the same normalized caption/layout/size slots. */
export const kleinBaseValues = kleinValues;

/** One Base edit template per reference count; no hardcoded sample image path. */
export function kleinBaseEditTemplate(count: number): WorkflowTemplate {
  const graph = structuredClone(baseEdit) as ApiGraph;
  const slots: WorkflowTemplate["slots"] = {
    prompt: { path: "edit-prompt.value", kind: "text" },
    bypassUpsample: { path: "51.switch", kind: "boolean" },
    megapixels: { path: "17.resolution.megapixels", kind: "number" },
    seed: { path: "7.seed", kind: "number" },
    unet_name: { path: "59.unet_name", kind: "model" },
    text_encoder: { path: "2.clip_name", kind: "model" },
    upsampler_encoder: { path: "46.clip_name", kind: "model" },
    vae: { path: "3.vae_name", kind: "model" },
  };
  // One image is in the pinned API graph. Extra images are supplied by the
  // same upload path and connected to both the latent and the vision upsampler.
  for (let i = 0; i < count; i++) {
    const id = `reference-${i}`;
    if (i > 0) graph[id] = { class_type: "LoadImage", inputs: { image: "pending" } };
    graph["17"].inputs[`images.image${i}`] = [id, 0];
    graph["50"].inputs[`images.image${i}`] = [id, 0];
    slots[id] = { path: `${id}.image`, kind: "image" };
  }
  return {
    id: "flux-3-klein-base-edit",
    file: "workflows/flux-3-klein-base-edit.json",
    graph,
    slots,
    requiredNodes: ["ReferenceMultiLatent", "BatchImagesNode", "TextGenerate"],
    requiredModels: kleinBaseWorkflow.requiredModels,
    output: { nodeId: "9", media: "image" },
  };
}

export function kleinBaseEditValues(input: GenerateInput, prompt: string) {
  // A layout JSON carries exact boxes. Its coordinates must bypass the
  // upsampler, whose supplied system prompt forbids JSON and coordinates.
  const bypassUpsample = Boolean(
    readLayout(prompt, input.imageReferences?.length ?? 0).json,
  );
  return { ...kleinEditValues(input, prompt), bypassUpsample };
}
