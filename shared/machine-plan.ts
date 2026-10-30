import { acceleratorOf, gb, GB, type Accelerator } from "./machine";
import type { MachineProbe } from "./machine";
import {
  CAPABILITIES,
  CAPABILITY_LABEL,
  CLOUD_MODELS,
  HOSTED_OPTIONS,
  LOCAL_MODELS,
  TRANSCRIPTION_MODEL,
  type Capability,
  type CloudCapability,
  type LocalModel,
} from "./machine-models";

/**
 * The machine check's plan: for each capability, whether it runs on this
 * machine or on Comfy Cloud (or a hosted model), which model, and why. Pure:
 * the same probe always gives the same plan, so the studio, the MCP tool and
 * a later run location (PR #61's `local` or `cloud`) read one answer.
 * `where` for Klein, LTX and the upscaler is that run location's own
 * vocabulary, so it can take this plan as its default.
 */
export type Where = "local" | "cloud" | "hosted";

/**
 * Genobi's own margins, not model figures. Apple silicon shares its memory
 * with macOS, the studio and the browser, so a quarter is left to them; the
 * disk keeps room for takes and the system. Models already downloaded are not
 * detected, so every local model is counted as a download.
 */
export const UNIFIED_SHARE = 0.75;
export const DISK_RESERVE_GB = 10;

export interface Candidate {
  id: string;
  label: string;
  fits: boolean;
  /** The memory this plan counted, in GB: the documented figure times its factor. */
  memoryGb: number | null;
  diskGb: number;
  reason: string;
  sources: string[];
}

export interface CapabilityPlan {
  capability: Capability;
  label: string;
  where: Where;
  model: string;
  reason: string;
  /** Local models considered, largest first, each with why it fits or not. */
  candidates: Candidate[];
  /** Where it runs when nothing fits locally; null for transcription, local only. */
  fallback: { where: Where; model: string; source: string } | null;
  /** A hosted alternative, never chosen by the plan. */
  hosted: string | null;
  note: string | null;
}

export interface MachinePlan {
  version: 1;
  accelerator: Accelerator;
  /** Memory a local model may use: the largest GPU's VRAM, or a share of unified memory. */
  memoryBudgetGb: number;
  /** Free disk on the studio's volume, less the reserve. */
  diskBudgetGb: number;
  capabilities: CapabilityPlan[];
  caveats: string[];
}

const CAVEATS = [
  "Memory figures are the model makers' documented minimums for their reference code (Transformers or vLLM in BF16, or the named ComfyUI files). Quantised builds are not counted: their makers document no figure.",
  `On Apple silicon the GPU figures are counted against ${UNIFIED_SHARE * 100}% of unified memory (Genobi's margin for macOS and the studio). No maker documents a Mac, so a Mac fit is on paper until it is run.`,
  `The disk keeps ${DISK_RESERVE_GB} GB free, and models already downloaded are not detected, so each local model counts as a full download.`,
  "A model with no documented memory figure is never planned locally; it runs on Comfy Cloud. Transcription is the exception: voice mode already runs Qwen3-ASR on the local server, and the plan checks only its download.",
];

const NOTES: Record<CloudCapability, string> = {
  listening:
    "Genobi has no local listening worker yet: this is the model to install when it lands. Until then, listening runs on Comfy Cloud.",
  vision:
    "Genobi has no local vision worker yet; vision runs on Comfy Cloud until one lands.",
  klein:
    "Runs on Comfy Cloud through the workflow route; a local ComfyUI run location is the alternative.",
  ltx: "Runs on Comfy Cloud through the workflow route; a local ComfyUI run location is the alternative.",
  upscaler:
    "Runs on Comfy Cloud through the workflow route; a local ComfyUI run location is the alternative.",
};

const ACCELERATOR_NAME: Record<Exclude<Accelerator, "none">, string> = {
  nvidia: "NVIDIA GPUs",
  apple: "Apple silicon",
};

const round = (value: number) => Math.round(value * 100) / 100;

function budgets(probe: MachineProbe, accelerator: Accelerator) {
  const memory =
    accelerator === "nvidia"
      ? Math.max(...probe.nvidia!.gpus.map((gpu) => gpu.vramBytes))
      : accelerator === "apple"
        ? probe.apple!.unifiedMemoryBytes * UNIFIED_SHARE
        : 0;
  const disk = probe.disk
    ? Math.max(0, probe.disk.freeBytes / GB - DISK_RESERVE_GB)
    : 0;
  return { memoryGb: round(memory / GB), diskGb: round(disk) };
}

function judge(
  model: LocalModel,
  accelerator: Accelerator,
  memoryBudget: number,
  diskBudget: number,
  diskKnown: boolean,
): Candidate {
  const needed =
    model.memoryGb === null
      ? null
      : round(model.memoryGb * (model.practicalFactor ?? 1));
  const base = {
    id: model.id,
    label: model.label,
    memoryGb: needed,
    diskGb: model.diskGb,
    sources: model.sources,
  };
  const no = (reason: string) => ({ ...base, fits: false, reason });
  if (needed === null)
    return no(`No documented memory figure. ${model.memoryNote}`);
  if (accelerator === "none")
    return no(
      "No NVIDIA GPU or Apple silicon found; the documented figure is GPU memory.",
    );
  if (!model.accelerators.includes(accelerator))
    return no(
      `Documented for ${model.accelerators.map((a) => ACCELERATOR_NAME[a]).join(" and ")} only; this machine has ${ACCELERATOR_NAME[accelerator]}.`,
    );
  const factor = model.practicalFactor
    ? ` (${model.memoryGb} GB × ${model.practicalFactor}, the card's factor for real use)`
    : "";
  if (needed > memoryBudget)
    return no(
      `Needs ${needed} GB of GPU memory${factor}; ${memoryBudget} GB is usable here.`,
    );
  if (!diskKnown)
    return no("The free disk could not be read, so no download is planned.");
  if (model.diskGb > diskBudget)
    return no(
      `Fits in memory, but the ${model.diskGb} GB download needs more than the ${diskBudget} GB of disk free after the reserve.`,
    );
  return {
    ...base,
    fits: true,
    reason: `Fits: needs ${needed} GB of GPU memory${factor}, ${memoryBudget} GB usable; ${model.diskGb} GB download, ${diskBudget} GB free after the reserve.`,
  };
}

/** Memory free right now, against the chosen model, as a gentle warning. */
function freeNow(probe: MachineProbe, accelerator: Accelerator) {
  if (accelerator === "nvidia") {
    const free = probe.nvidia!.gpus.map((gpu) => gpu.freeVramBytes);
    return free.every((value) => value !== null)
      ? Math.max(...(free as number[])) / GB
      : null;
  }
  return probe.memory.availableBytes === null
    ? null
    : probe.memory.availableBytes / GB;
}

/**
 * Voice mode's speech to text: always on this machine, since the hosted
 * studio has no voice route. Metal on Apple silicon, the CPU otherwise, as
 * the voice worker chooses. No memory figure is documented, so only the
 * download is checked, and a short disk is a note rather than a move.
 */
function transcriptionPlan(
  accelerator: Accelerator,
  diskBudget: number,
  diskKnown: boolean,
): CapabilityPlan {
  const model = TRANSCRIPTION_MODEL;
  const device = accelerator === "apple" ? "Metal" : "CPU";
  const room = diskKnown && model.diskGb <= diskBudget;
  const disk = !diskKnown
    ? "The free disk could not be read."
    : room
      ? `The ${model.diskGb} GB download fits; ${diskBudget} GB free after the reserve.`
      : `The ${model.diskGb} GB download needs more than the ${diskBudget} GB free after the reserve, unless voice mode is installed already.`;
  return {
    capability: "transcription",
    label: CAPABILITY_LABEL.transcription,
    where: "local",
    model: `${model.label} (${device})`,
    reason: `Voice mode runs it on the local server, in fp16 on Metal on Apple silicon and fp32 on the CPU otherwise. No documented memory figure, so memory is not checked: ${model.memoryNote}`,
    candidates: [
      {
        id: model.id,
        label: model.label,
        fits: room,
        memoryGb: null,
        diskGb: model.diskGb,
        reason: disk,
        sources: model.sources,
      },
    ],
    fallback: null,
    hosted: null,
    note: `Voice mode runs on the local server only; the hosted studio has no voice route. Set it up from the header mic. ${disk}`,
  };
}

export function planMachine(probe: MachineProbe): MachinePlan {
  const accelerator = acceleratorOf(probe);
  const budget = budgets(probe, accelerator);
  const available = freeNow(probe, accelerator);
  const capabilities = CAPABILITIES.map((capability): CapabilityPlan => {
    if (capability === "transcription")
      return transcriptionPlan(accelerator, budget.diskGb, probe.disk !== null);
    const candidates = LOCAL_MODELS.filter(
      (model) => model.capability === capability,
    ).map((model) =>
      judge(
        model,
        accelerator,
        budget.memoryGb,
        budget.diskGb,
        probe.disk !== null,
      ),
    );
    const cloud = CLOUD_MODELS[capability];
    const fallback = {
      where: cloud.where,
      model: cloud.label,
      source: cloud.source,
    };
    const chosen = candidates.find((candidate) => candidate.fits);
    const busy =
      chosen && available !== null && chosen.memoryGb! > available
        ? ` Only ${gb(available * GB)} GB is free right now: close other apps before running it.`
        : "";
    return {
      capability,
      label: CAPABILITY_LABEL[capability],
      where: chosen ? "local" : fallback.where,
      model: chosen ? chosen.label : fallback.model,
      reason: chosen
        ? `The largest local model that fits. ${chosen.reason}`
        : `Nothing fits locally (${candidates.map((c) => `${c.label}: ${c.reason}`).join(" ")}) Runs on ${fallback.where === "cloud" ? "Comfy Cloud" : "a hosted model"}.`,
      candidates,
      fallback,
      hosted: HOSTED_OPTIONS[capability] ?? null,
      note: chosen ? `${NOTES[capability]}${busy}` : null,
    };
  });
  return {
    version: 1,
    accelerator,
    memoryBudgetGb: budget.memoryGb,
    diskBudgetGb: budget.diskGb,
    capabilities,
    caveats: CAVEATS,
  };
}

/** One line per capability: where it runs and which model. */
export function summarisePlan(plan: MachinePlan): string[] {
  return plan.capabilities.map(
    (c) =>
      `${c.label}: ${c.model}, ${c.where === "local" ? "on this machine" : c.where === "cloud" ? "on Comfy Cloud" : "hosted"}.`,
  );
}
