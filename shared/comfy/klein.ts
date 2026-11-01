import {
  MAX_IMAGE_PIXELS,
  type ImageAspectRatio,
  type ImageResolution,
} from "../image";
import { LayoutError, readLayout } from "../image-layout";
import type { ApiGraph } from "./slots";
import { unsent, type WorkflowTemplate } from "./workflow";
import kleinGraph from "../../workflows/flux-3-klein-t2i.json";

/**
 * FLUX 3 Image Klein, text to image, as an open workflow: Comfy's official
 * `image_flux3_klein_distilled_t2i` template (Comfy-Org/workflow_templates,
 * MIT, commit 369c1ed) in API format, with its subgraph flattened, the
 * resolution picker and previews removed, and one `StringConcatenate` that
 * appends the layout rows after the prompt upsampler. See
 * `workflows/flux-3-klein-t2i.README.md`.
 */
export const kleinWorkflow: WorkflowTemplate = {
  id: "flux-3-klein-t2i",
  file: "workflows/flux-3-klein-t2i.json",
  graph: kleinGraph as ApiGraph,
  slots: {
    prompt: { path: "18:17.value", kind: "text" },
    layout: { path: "18:20.string_b", kind: "text" },
    upsample: { path: "18:16.switch", kind: "boolean" },
    width: { path: "18:6.width", kind: "number" },
    height: { path: "18:6.height", kind: "number" },
    seed: { path: "18:7.seed", kind: "number" },
    // Model slots are filled only for a local ComfyUI, from the operator's
    // model map (GENOBI_LOCAL_MODELS, or GENOBI_KLEIN_MODEL for unet_name).
    unet_name: { path: "18:1.unet_name", kind: "model" },
    text_encoder: { path: "18:2.clip_name", kind: "model" },
    upsampler_encoder: { path: "18:12.clip_name", kind: "model" },
    vae: { path: "18:3.vae_name", kind: "model" },
  },
  requiredNodes: [
    "TextGenerate",
    "ComfySwitchNode",
    "StringConcatenate",
    "EmptyFlux2LatentImage",
  ],
  requiredModels: [
    // Official Comfy template filename; Cloud checks its live catalogue before
    // sending, falling back to the older account alias only if listed.
    "flux3-image-klein-int8-convrot.safetensors",
    "qwen3vl_4b_int8_convrot.safetensors",
    "qwen3.5_9b_flux3_prompt_upsampler_w4a8.safetensors",
    "flux2-vae.safetensors",
  ],
  output: { nodeId: "9", media: "image" },
};

/** The diffusion model file the graph names, read from the file. */
export const KLEIN_UNET: string = kleinGraph["18:1"].inputs.unet_name;

/**
 * Equal-area pixel counts per tier, as BFL describes its tiers: 768 × 768,
 * then about 1, 2.4, 4.2 and 16.8 megapixels. BFL does not publish exact
 * dimensions, so these are the graph's own sizes, not the API's.
 */
const TIER_EDGE: Record<ImageResolution, number> = {
  "768sq": 768,
  "1k": 1024,
  "1.5k": 1536,
  "2k": 2048,
  "4k": 4096,
};

/**
 * Width and height for a ratio and tier, each a multiple of 16 (the latent's
 * step). Both round down, so the frame never exceeds the tier's area, and the
 * 4K tier never exceeds `MAX_IMAGE_PIXELS`, the most either adapter reads back
 * (`inspectImage`): rounding up would make a paid result undeliverable.
 */
export function kleinSize(
  ratio: Exclude<ImageAspectRatio, "auto">,
  tier: ImageResolution,
): { width: number; height: number } {
  const [w, h] = ratio.split(":").map(Number);
  const area = Math.min(TIER_EDGE[tier] ** 2, MAX_IMAGE_PIXELS);
  const step = (n: number) => Math.max(16, Math.floor(n / 16) * 16);
  return {
    width: step(Math.sqrt((area * w) / h)),
    height: step(Math.sqrt((area * h) / w)),
  };
}

/**
 * The values the open Klein graph's slots receive. BFL asks for Klein's prompt
 * upsampler on every plain prompt, and its system prompt reads a leading
 * `TARGET CANVAS: W:H` line. The same system prompt strips JSON, ids and
 * coordinates, so a prompt with layout rows skips the upsampler and goes to
 * the encoder in BFL's layout format: caption, a space, the rows, exactly as
 * Comfy's own `Flux3LayoutPrompt` node writes it.
 */
export function kleinValues(
  input: {
    imageAspectRatio?: ImageAspectRatio;
    imageResolution?: ImageResolution;
    imageReferences?: string[];
  },
  prompt: string,
  random: () => number = Math.random,
) {
  let layout;
  try {
    layout = readLayout(prompt, input.imageReferences?.length ?? 0);
  } catch (error) {
    if (error instanceof LayoutError) throw unsent(error.message);
    throw error;
  }
  const ratio =
    input.imageAspectRatio && input.imageAspectRatio !== "auto"
      ? input.imageAspectRatio
      : "1:1";
  const upsample = !layout.json;
  return {
    prompt: upsample
      ? `TARGET CANVAS: ${ratio}\n${layout.caption}`
      : layout.caption,
    layout: layout.json,
    upsample,
    ...kleinSize(ratio, input.imageResolution ?? "1k"),
    seed: Math.floor(random() * 2 ** 48),
  };
}
