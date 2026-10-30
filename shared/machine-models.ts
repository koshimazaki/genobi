import type { Accelerator } from "./machine";

/**
 * What each model the machine check considers needs, from its maker's own
 * documentation, checked 22 October 2026. Every figure names its source and
 * what it measures; a model whose maker documents no memory figure has
 * `memoryGb: null` and is never planned locally (it runs on Comfy Cloud).
 * Figures are decimal gigabytes (1e9 bytes), as the makers and Hugging Face
 * write them. Downloads are the weight files from each repository's Hugging
 * Face file listing, one format only.
 *
 * The models and their order come from issue #12 ("Listening models, chosen
 * per machine", ledger 360–361) and `docs/comfy-cloud-inventory.md`. Gemma 3n
 * is left out: its licence is gated. Quantised builds (4-bit and the like) are
 * not counted, because their makers document no memory figure for them.
 */
export type Capability =
  "transcription" | "listening" | "vision" | "klein" | "ltx" | "upscaler";
/** Every capability but transcription, which voice mode runs locally only. */
export type CloudCapability = Exclude<Capability, "transcription">;
export const CAPABILITIES: readonly Capability[] = [
  "transcription",
  "listening",
  "vision",
  "klein",
  "ltx",
  "upscaler",
];
export const CAPABILITY_LABEL: Record<Capability, string> = {
  transcription: "Transcription (voice mode)",
  listening: "Listening (describing music and sound)",
  vision: "Vision (reading images and frames)",
  klein: "FLUX 3 Image Klein (stills and box edits)",
  ltx: "LTX-2.5 (video)",
  upscaler: "Upscaler (open video upscale)",
};

export interface LocalModel {
  id: string;
  label: string;
  capability: Capability;
  /** Documented peak GPU memory in GB, or null when the maker gives none. */
  memoryGb: number | null;
  /** A multiplier the same source documents for real use, if it gives one. */
  practicalFactor?: number;
  /** What the memory figure measures, or why there is none. */
  memoryNote: string;
  /** The accelerators the documentation covers. */
  accelerators: Exclude<Accelerator, "none">[];
  /** The download, in GB, and which files it counts. */
  diskGb: number;
  diskNote: string;
  sources: string[];
}

export interface CloudModel {
  capability: CloudCapability;
  where: "cloud" | "hosted";
  label: string;
  source: string;
}

const INVENTORY = "docs/comfy-cloud-inventory.md";
const QWEN3_OMNI =
  "https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct#minimum-gpu-memory-requirements";
const BOTH: LocalModel["accelerators"] = ["nvidia", "apple"];

/**
 * Local candidates per capability, largest first. A capability runs locally
 * on the first one that fits; otherwise on its Comfy Cloud model below.
 */
export const LOCAL_MODELS: readonly LocalModel[] = [
  {
    id: "qwen3-omni-30b-a3b-captioner",
    label: "Qwen3-Omni-30B-A3B-Captioner",
    capability: "listening",
    memoryGb: null,
    memoryNote:
      "The Captioner's model card gives no memory figure. The Qwen3-Omni table measures the Thinking model (the thinker alone, as in the Captioner) at 68.74 GB for 15 s of video, but not the Captioner itself.",
    accelerators: BOTH,
    diskGb: 63.44,
    diskNote: "The safetensors shards, Hugging Face file listing.",
    sources: [
      "https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Captioner",
      QWEN3_OMNI,
    ],
  },
  {
    id: "qwen3-omni-30b-a3b-instruct",
    label: "Qwen3-Omni-30B-A3B-Instruct",
    capability: "listening",
    memoryGb: 78.85,
    memoryNote:
      "Minimum GPU memory, BF16 with Transformers and FlashAttention 2, for 15 s of video (the shortest input the card's table lists); a theoretical minimum.",
    accelerators: BOTH,
    diskGb: 70.52,
    diskNote: "The safetensors shards, Hugging Face file listing.",
    sources: [QWEN3_OMNI],
  },
  {
    id: "voxtral-small-24b-2507",
    label: "Voxtral Small 24B",
    capability: "listening",
    memoryGb: 55,
    memoryNote: "About 55 GB of GPU RAM in bf16 or fp16, per the model card.",
    accelerators: BOTH,
    diskGb: 48.52,
    diskNote:
      "consolidated.safetensors, the format the card's vLLM command loads.",
    sources: ["https://huggingface.co/mistralai/Voxtral-Small-24B-2507"],
  },
  {
    id: "qwen2-5-omni-7b",
    label: "Qwen2.5-Omni-7B",
    capability: "listening",
    memoryGb: 31.11,
    practicalFactor: 1.2,
    memoryNote:
      "Minimum GPU memory, BF16, for 15 s of video; the card says real use is typically at least 1.2 times higher.",
    accelerators: BOTH,
    diskGb: 22.36,
    diskNote: "The safetensors shards, Hugging Face file listing.",
    sources: ["https://huggingface.co/Qwen/Qwen2.5-Omni-7B"],
  },
  {
    id: "voxtral-mini-3b-2507",
    label: "Voxtral Mini 3B",
    capability: "listening",
    memoryGb: 9.5,
    memoryNote: "About 9.5 GB of GPU RAM in bf16 or fp16, per the model card.",
    accelerators: BOTH,
    diskGb: 9.35,
    diskNote:
      "consolidated.safetensors, the format the card's vLLM command loads.",
    sources: ["https://huggingface.co/mistralai/Voxtral-Mini-3B-2507"],
  },
  {
    id: "qwen3-vl-8b-instruct",
    label: "Qwen3-VL-8B-Instruct",
    capability: "vision",
    memoryGb: null,
    memoryNote:
      "The Qwen3-VL card has none, and the README's table is commented out and covers Qwen2.5-VL.",
    accelerators: BOTH,
    diskGb: 17.53,
    diskNote: "The safetensors shards, Hugging Face file listing.",
    sources: [
      "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct",
      "https://github.com/QwenLM/Qwen3-VL",
    ],
  },
  {
    id: "flux-3-image-klein-int8",
    label: "FLUX 3 Image Klein (ComfyUI int8)",
    capability: "klein",
    memoryGb: 8,
    memoryNote:
      "BFL: the int8 ComfyUI files run on 8 GB GPUs such as the RTX 3070. BFL documents NVIDIA GPUs only (its bf16 peak is 31 GB on a B200).",
    accelerators: ["nvidia"],
    diskGb: 17.75,
    diskNote:
      "The int8 diffusion model, Qwen3-VL 4B int8 encoder, w4a8 prompt upsampler and VAE that Genobi's Klein graph loads, from the Comfy repository's file listing.",
    sources: [
      "https://github.com/black-forest-labs/flux-3-image-klein#memory",
      "https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy",
    ],
  },
  {
    id: "ltx-2-5-22b-distilled",
    label: "LTX-2.5 22B distilled",
    capability: "ltx",
    memoryGb: null,
    memoryNote:
      "Lightricks' LTX-2 README and optimisation guide give FP8 and offload advice but 'no absolute timings or VRAM figures'.",
    accelerators: ["nvidia"],
    diskGb: 70.87,
    diskNote:
      "About 66 GiB for the distilled pipeline's files, per the LTX-2 README.",
    sources: [
      "https://github.com/Lightricks/LTX-2",
      "https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/docs/optimization.md",
    ],
  },
  {
    id: "seedvr2-3b-fp8",
    label: "SeedVR2 3B (FP8)",
    capability: "upscaler",
    memoryGb: 16,
    memoryNote:
      "The ComfyUI-SeedVR2 pack's hardware tiers: FP8 models at 12–16 GB of VRAM with BlockSwap or VAE tiling as needed; the top of the tier is used. The pack documents Apple silicon (MPS) support.",
    accelerators: BOTH,
    diskGb: 3.89,
    diskNote:
      "seedvr2_ema_3b_fp8_e4m3fn and ema_vae_fp16, Hugging Face file listing.",
    sources: [
      "https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler#-requirements",
      "https://huggingface.co/numz/SeedVR2_comfyUI",
    ],
  },
];

/**
 * Speech to text for voice mode (#50), apart from listening (understanding
 * music and sound). Voice mode already runs it on the local server: fp16 on
 * Metal on Apple silicon, fp32 on the CPU otherwise
 * (`server/voice-worker/voice_worker.py`), and the hosted studio has no voice
 * route, so it has no Cloud fallback. Its maker documents no memory figure,
 * so the plan checks only the download; it is not a local candidate the way
 * the models above are.
 */
export const TRANSCRIPTION_MODEL: LocalModel = {
  id: "qwen3-asr-0.6b",
  label: "Qwen3-ASR-0.6B",
  capability: "transcription",
  memoryGb: null,
  memoryNote:
    "Qwen3-ASR's model card and README give no memory figure. Genobi has run it on Metal on an M1 Max (32 GB) on 21 October 2026 (docs/voice-mode.md).",
  accelerators: BOTH,
  diskGb: 1.88,
  diskNote:
    "The pinned snapshot's eight runtime files, 1,880,560,703 bytes (`server/voice-model.ts`, docs/voice-mode.md).",
  sources: [
    "https://huggingface.co/Qwen/Qwen3-ASR-0.6B/tree/5eb144179a02acc5e5ba31e748d22b0cf3e303b0",
    "https://github.com/koshimazaki/Genobi/blob/main/docs/voice-mode.md",
  ],
};

/** Where each capability runs when nothing fits locally. */
export const CLOUD_MODELS: Record<CloudCapability, CloudModel> = {
  listening: {
    capability: "listening",
    where: "cloud",
    label: "Gemma 4 through core TextGenerate (audio in)",
    source: INVENTORY,
  },
  vision: {
    capability: "vision",
    where: "cloud",
    label: "Qwen3-VL through core TextGenerate",
    source: INVENTORY,
  },
  klein: {
    capability: "klein",
    where: "cloud",
    label: "FLUX 3 Image Klein distilled int8",
    source: INVENTORY,
  },
  ltx: {
    capability: "ltx",
    where: "cloud",
    label: "LTX-2.5 22B distilled int8",
    source: INVENTORY,
  },
  upscaler: {
    capability: "upscaler",
    where: "cloud",
    label: "SeedVR2 3B int8 (native nodes)",
    source: INVENTORY,
  },
};

/** Hosted options beside Comfy Cloud, never chosen by the plan itself. */
export const HOSTED_OPTIONS: Partial<Record<Capability, string>> = {
  listening: "Gemini or hosted Qwen Omni Flash: API only, an optional premium",
};
