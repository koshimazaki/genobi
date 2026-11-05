import type { GenerateInput, Job } from "../types";
import { readNestedSettings } from "./generation-settings-read";
import { presets } from "../legacy-camera";
import { MAX_IMAGE_REFERENCES } from "../image";

/**
 * The settings a Camera run was made with, recorded on the project's
 * generation when the run is sent to the Director, so a Recreate from the
 * project restores the run from the project's own record: prompt parts,
 * model, duration, aspect, resolution, camera, the LTX gaps and Light, the
 * swap's settings, a deployment's seed and negative prompt, and the image
 * options.
 *
 * Public by construction: an allowlist of request settings only. Never a
 * job, provider or source id, a deployment URL or its file tickets, image
 * bytes, the session or a key. It is checked again on every read, since a
 * bundle can come from anywhere; an unknown or ill-typed field is dropped,
 * and a nested record (camera, LTX prompt parts, Acoustic, swap) must read
 * as its own reader reads it (`generation-settings-read.ts`).
 */
export type GenerationSettings = Partial<
  Pick<
    GenerateInput,
    | "generator"
    | "model"
    | "description"
    | "cameraEnabled"
    | "camera"
    | "cameraEdits"
    | "cameraText"
    | "presetId"
    | "duration"
    | "resolution"
    | "aspectRatio"
    | "draft"
    | "acoustic"
    | "ltxPrompt"
    | "upscalePrompt"
    | "upscaleFactor"
    | "upscaleCreativity"
    | "lyrics"
    | "swap"
    | "imageResolution"
    | "imageProvider"
    | "imageAspectRatio"
    | "imageGrounding"
    | "imageSafetyTolerance"
  >
> & {
  /** Actual FLUX still provider read from the take, distinct from Auto. */
  imageProviderUsed?: "bfl" | "comfy";
  /** How many reference images the run sent (they are project assets). */
  imageReferenceCount?: number;
  /**
   * How many Klein edit boxes the run drew. The boxes are not stored: their
   * instructions stay in `description`, as composed, and Recreate names them.
   */
  imageRegionCount?: number;
  /**
   * The run's reference slots in order, each an index into the generation's
   * `referenceAssetIds`, when one image filled more than one slot (the
   * project holds it once). Image numbers in the prompt follow these slots.
   */
  referenceSlots?: number[];
  /** A deployment run's own inputs; its file tickets are never kept. */
  deploy?: { seed: number; negativePrompt: string; recipe?: string };
};

const STRINGS = [
  "generator",
  "model",
  "description",
  "cameraText",
  "resolution",
  "aspectRatio",
  "upscalePrompt",
  "lyrics",
  "imageResolution",
  "imageProvider",
  "imageAspectRatio",
] as const;
const NUMBERS = [
  "duration",
  "upscaleFactor",
  "upscaleCreativity",
  "imageSafetyTolerance",
  "imageReferenceCount",
  "imageRegionCount",
] as const;
const BOOLEANS = ["cameraEnabled", "draft", "imageGrounding"] as const;

/** The JSON size one record may take in a project. */
export const GENERATION_SETTINGS_BYTES = 32_000;

const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** The settings' allowlist, from a job or a stored record; undefined if empty. */
export function publicGenerationSettings(
  value: unknown,
): GenerationSettings | undefined {
  if (!plain(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of STRINGS)
    if (
      typeof value[key] === "string" &&
      (value[key] as string).length <= 12_000
    )
      // Control characters never reach the composer from a file.
      out[key] = (value[key] as string).replace(
        /[\x00-\x08\x0b-\x1f\x7f]/g,
        "",
      );
  for (const key of NUMBERS)
    if (typeof value[key] === "number" && Number.isFinite(value[key]))
      out[key] = value[key];
  for (const key of BOOLEANS)
    if (typeof value[key] === "boolean") out[key] = value[key];
  if (value.imageProviderUsed === "bfl" || value.imageProviderUsed === "comfy")
    out.imageProviderUsed = value.imageProviderUsed;
  // Nested records are read by their own rules; a malformed one is dropped.
  Object.assign(out, readNestedSettings(value));
  const slots = value.referenceSlots;
  if (
    Array.isArray(slots) &&
    slots.length > 0 &&
    slots.length <= MAX_IMAGE_REFERENCES &&
    slots.every(
      (i) => Number.isInteger(i) && i >= 0 && i < MAX_IMAGE_REFERENCES,
    )
  )
    out.referenceSlots = [...slots];
  // A legacy camera preset (runs before `camera`): Camera's restore turns it
  // into camera terms, so its wording comes back with the description.
  if (presets.some((p) => p.id === value.presetId))
    out.presetId = value.presetId;
  const deploy = value.deploy;
  if (
    plain(deploy) &&
    Number.isSafeInteger(deploy.seed) &&
    typeof deploy.negativePrompt === "string"
  )
    out.deploy = {
      seed: deploy.seed,
      negativePrompt: deploy.negativePrompt,
      ...(typeof deploy.recipe === "string" ? { recipe: deploy.recipe } : {}),
    };
  if (!Object.keys(out).length) return undefined;
  const settings = JSON.parse(JSON.stringify(out)) as GenerationSettings;
  return JSON.stringify(settings).length <= GENERATION_SETTINGS_BYTES
    ? settings
    : undefined;
}

/**
 * A job-shaped record of the settings, for Camera's own restore reducer and
 * gap names (`recreate-gaps.ts`). It carries no id the studio could read a
 * take or run inputs by: what the project holds is all that is restored.
 */
export function settingsJob(settings: GenerationSettings, prompt: string): Job {
  const { deploy, imageProviderUsed: _providerUsed, ...rest } = settings;
  return {
    generator: "video",
    description: prompt,
    cameraEnabled: false,
    duration: 5,
    resolution: "hd",
    aspectRatio: "16:9",
    draft: false,
    upscaleFactor: 2,
    upscaleCreativity: 0,
    ...rest,
    ...(deploy ? { deploy: { ...deploy, assets: {} } } : {}),
    id: "project-generation",
    prompt,
    status: "Ready",
    createdAt: "",
    updatedAt: "",
    costEstimateUsd: 0,
    keyMode: "byo",
  } as Job;
}
