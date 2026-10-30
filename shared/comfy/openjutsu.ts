import graph from "../../workflows/openjutsu-swap.json";
import { swapPrompt } from "../openjutsu";
import type { GenerateInput } from "../types";
import type { ApiGraph } from "./slots";
import { unsent, type WorkflowTemplate } from "./workflow";

/**
 * Openjutsu's swap graph (`workflows/openjutsu-swap.json`, a byte-for-byte
 * copy of Comfy-Org/comfy-openjutsu's `workflows/swap.api.json` at 70ec62d,
 * reformatted), as a template. The slots are the node bindings Openjutsu's
 * `lib/swap.ts` writes: the clip into `30`, the character into `9`, the part
 * into `trim` and `31`, the size into `31` as a number, the prompt and seed
 * into `801`. Without a first frame the anchor nodes go and `803` stops
 * asking for one, as Openjutsu does, through the slot's `whenAbsent` rule.
 *
 * The graph needs Akatz Labs' patched `h3_character_swap` node pack, MiniMax
 * H3 and SAM 3.1, which neither Comfy Cloud nor a stock ComfyUI has, so a run
 * goes to a Comfy deployment built with them (`comfy-build/`), never to the
 * session's Cloud or local ComfyUI.
 */
export const swapWorkflow: WorkflowTemplate = {
  id: "openjutsu-swap",
  file: "workflows/openjutsu-swap.json",
  graph: graph as ApiGraph,
  slots: {
    clip: { path: "30.file", kind: "video" },
    character: { path: "9.image", kind: "image" },
    anchor: {
      path: "anchor_image.image",
      kind: "image",
      whenAbsent: {
        drop: ["anchor_image", "anchor_fit", "803.anchor"],
        set: { "803.use_anchor": false },
      },
    },
    start: { path: "trim.start_time", kind: "number" },
    seconds: { path: "trim.duration", kind: "number" },
    prepare_seconds: { path: "31.duration_seconds", kind: "number" },
    size: { path: "31.resolution", kind: "number" },
    prompt: { path: "801.prompt", kind: "text" },
    seed: { path: "801.seed", kind: "number" },
    // Named so the template table's loader check holds; the deployment's
    // build holds these files, and no model map fills them.
    unet_name: { path: "1.unet_name", kind: "model" },
    turbo_lora: { path: "4.lora_name", kind: "model" },
    text_encoder: { path: "6.clip_name", kind: "model" },
    video_vae: { path: "7.vae_name", kind: "model" },
    audio_vae: { path: "8.vae_name", kind: "model" },
    sam: { path: "100.ckpt_name", kind: "model" },
    swap_lora: { path: "850.lora_name", kind: "model" },
  },
  requiredNodes: [
    "Video Slice",
    "MiniMaxH3SigmaShift",
    "SAM3_Detect",
    "SAM3_VideoTrack",
    "H3CharacterSwapPrepareVideo",
    "H3CharacterSwapShot",
    "H3CharacterSwapController",
    "H3CharacterSwapAssemble",
  ],
  requiredModels: [
    "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    "minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors",
    "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    "minimax_h3_video_vae_fp16.safetensors",
    "minimax_h3_audio_vae_fp32.safetensors",
    "sam3.1_multiplex_fp16.safetensors",
    "h3_character_swap_v1.5.safetensors",
  ],
  output: { nodeId: "809", media: "video" },
  hosts: ["deployment"],
};

/**
 * The values the swap's slots receive. `prompt` is the run's direction (its
 * description, composed without a camera); the files are filled by the
 * client that sends them. The first frame is reference 2.
 */
export function swapValues(input: GenerateInput, prompt: string) {
  const swap = input.swap;
  if (!swap) throw unsent("The character swap needs its part, size and seed.");
  return {
    start: swap.start,
    seconds: input.duration,
    prepare_seconds: input.duration,
    size: swap.size,
    prompt: swapPrompt(
      prompt,
      (input.imageReferences?.length ?? 0) > 1,
      swap.items,
    ),
    seed: swap.seed,
  };
}
