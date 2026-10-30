import type { genmodVideoPass } from "../genmod/plan";
import type { ApiGraph } from "./slots";
import { VIDEO_OUTPUT, type WorkflowTemplate } from "./workflow";
import audioGraph from "../../workflows/ltx-2-5-genmod-audio.json";
import controlGraph from "../../workflows/ltx-2-5-genmod-control.json";

/**
 * The Gen-Mod video passes as open workflows, core ComfyUI nodes only. Both
 * are Comfy Cloud's LTX-2.5 two-stage template (`workflows/ltx-2-5-t2v.json`)
 * opening on the approved frame 0 and carrying the source clip's own
 * soundtrack, frozen and muxed back as it was. The control graph adds the
 * source's pose (SDPose) as a Union Control IC-LoRA guide through the core
 * `GetICLoRAParameters` and `LTXVAddGuide`. See `workflows/genmod.README.md`.
 * The output keeps the source's aspect (`genmodSize`). They are not in the
 * template table yet: no registry entry runs them.
 */
const SHARED_SLOTS = {
  prompt: { path: "398:376.value", kind: "text" },
  frames: { path: "398:378.value", kind: "number" },
  fps: { path: "398:361.value", kind: "number" },
  seconds: { path: "903.duration", kind: "number" },
  width: { path: "398:372.value", kind: "number" },
  height: { path: "398:360.value", kind: "number" },
  seed: { path: "398:339.noise_seed", kind: "number" },
  refine_seed: { path: "398:338.noise_seed", kind: "number" },
  first_frame: { path: "395.image", kind: "image" },
  source: { path: "901.file", kind: "video" },
  unet_name: { path: "398:384.unet_name", kind: "model" },
  text_encoder: { path: "398:387.clip_name", kind: "model" },
  video_vae: { path: "398:385.vae_name", kind: "model" },
  audio_vae: { path: "398:386.vae_name", kind: "model" },
  latent_upscaler: { path: "398:371.model_name", kind: "model" },
} as const;

export const genmodAudioWorkflow: WorkflowTemplate = {
  id: "ltx-2-5-genmod-audio",
  file: "workflows/ltx-2-5-genmod-audio.json",
  graph: audioGraph as ApiGraph,
  slots: SHARED_SLOTS,
  requiredNodes: ["LoadVideo", "TrimAudioDuration", "LTXVAudioVAEEncode"],
  requiredModels: [],
  output: VIDEO_OUTPUT,
};

export const genmodControlWorkflow: WorkflowTemplate = {
  id: "ltx-2-5-genmod-control",
  file: "workflows/ltx-2-5-genmod-control.json",
  graph: controlGraph as ApiGraph,
  slots: {
    ...SHARED_SLOTS,
    guide_strength: { path: "917.strength", kind: "number" },
    pose_model: { path: "911.ckpt_name", kind: "model" },
    iclora_name: { path: "915.lora_name", kind: "model" },
  },
  requiredNodes: [
    "SDPoseKeypointExtractor",
    "SDPoseDrawKeypoints",
    "GetICLoRAParameters",
    "LTXVAddGuide",
    "LTXVCropGuides",
  ],
  requiredModels: [
    "sdpose_wholebody_fp16.safetensors",
    "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors",
  ],
  output: VIDEO_OUTPUT,
};

/** Megapixels per output tier, as the Acoustic Space graph renders. */
const MEGAPIXELS = { hd: 0.9, fhd: 2.1 } as const;

/**
 * The output size for a source frame: its own aspect at the tier's pixel
 * budget, each side a multiple of 64 so stage 1's half-size latent stays on
 * LTX's 32-pixel grid. Portrait, square and widescreen keep their framing.
 */
export function genmodSize(
  frame: { width: number; height: number },
  megapixels: number,
) {
  if (!(frame.width > 0 && frame.height > 0))
    throw new Error("The source frame needs a size");
  const scale = Math.sqrt((megapixels * 1e6) / (frame.width * frame.height));
  const side = (v: number) => Math.max(256, Math.round((v * scale) / 64) * 64);
  return { width: side(frame.width), height: side(frame.height) };
}

/**
 * The slot values for one planned pass (`genmodVideoPass`), the source's
 * frame rate rounded to whole frames. The masked route has its own graph.
 * Files go separately: frame 0 to `first_frame`, the cut clip to `source`.
 */
export function genmodValues(
  pass: ReturnType<typeof genmodVideoPass>,
  sourceFps: number,
  tier: keyof typeof MEGAPIXELS = "hd",
  random: () => number = Math.random,
) {
  if (pass.route === "masked")
    throw new Error("The masked route runs the in/outpaint graph");
  if (pass.route === "control" && pass.control.guide !== "pose")
    throw new Error("This graph reads pose; depth and canny guides come later");
  if (pass.audio !== "keep")
    throw new Error(
      "These graphs keep the source soundtrack; generated audio is not wired yet",
    );
  if (pass.route === "control" && pass.control.isolate)
    throw new Error(
      "Subject isolation is not wired into this graph yet: leave control.isolate out to read the pose from the whole frame",
    );
  if (!(sourceFps >= 1 && sourceFps <= 120))
    throw new Error("The source frame rate must be 1–120 fps");
  const fps = Math.round(sourceFps);
  const seed = () => Math.floor(random() * 2 ** 48);
  return {
    template:
      pass.route === "control" ? genmodControlWorkflow : genmodAudioWorkflow,
    values: {
      prompt: pass.prompt,
      frames: pass.frames,
      fps,
      seconds: pass.frames / fps,
      ...genmodSize(pass.frame, MEGAPIXELS[tier]),
      seed: seed(),
      refine_seed: seed(),
      ...(pass.route === "control" ? { guide_strength: 1 } : {}),
    },
  };
}
