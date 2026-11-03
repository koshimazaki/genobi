import type { GenerateInput, Job } from "../types";

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
 * bundle can come from anywhere; an unknown or ill-typed field is dropped.
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
  /** How many reference images the run sent (they are project assets). */
  imageReferenceCount?: number;
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
] as const;
const BOOLEANS = ["cameraEnabled", "draft", "imageGrounding"] as const;
/** Plain JSON objects the composer's own reducer fits on restore. */
const OBJECTS = ["camera", "cameraEdits", "acoustic", "ltxPrompt", "swap"];

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
    if (typeof value[key] === "string" && (value[key] as string).length <= 12_000)
      // Control characters never reach the composer from a file.
      out[key] = (value[key] as string).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  for (const key of NUMBERS)
    if (typeof value[key] === "number" && Number.isFinite(value[key]))
      out[key] = value[key];
  for (const key of BOOLEANS)
    if (typeof value[key] === "boolean") out[key] = value[key];
  for (const key of OBJECTS) if (plain(value[key])) out[key] = value[key];
  if (value.acoustic === null) out.acoustic = null;
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
export function settingsJob(
  settings: GenerationSettings,
  prompt: string,
): Job {
  const { deploy, ...rest } = settings;
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
