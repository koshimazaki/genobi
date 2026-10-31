import { z } from "zod";
import { acousticSections, readAcoustic } from "../shared/acoustic";
import { cameraSections } from "../shared/camera";
import { IDEMPOTENCY_KEY } from "../shared/idempotency";
import {
  IMAGE_ASPECT_RATIOS,
  KLEIN_RESOLUTIONS,
  MAX_IMAGE_REFERENCES,
} from "../shared/image";
import { presets } from "../shared/presets";
import { DEPLOY_FILE_TOKENS } from "../shared/comfy/deploy-input";
import { projectAssetSchema, projectImageReferences } from "./project-assets";
import type { GenobiApi } from "./api";
import { QUOTE_ID } from "../shared/quote";
import type {
  AspectRatio,
  Generator,
  VideoModel,
  VideoResolution,
} from "../shared/types";

/**
 * The generation request an agent sends: the fields the studio sends to
 * `POST /api/quotes` and `POST /api/jobs`, typed from `shared/`. Bounds that
 * depend on the model (description length, duration range, which treatments
 * apply) stay with the server's validation, whose error comes back verbatim.
 */
type Choices<T extends string> = readonly [T, ...T[]];
const choices = <T extends string>(values: readonly T[]) =>
  z.enum(values as unknown as Choices<T>);

const generators = [
  "video",
  "upscale",
  "image",
  "edit",
  "audio",
] as const satisfies readonly Generator[];
const models = [
  "ltx-deploy-layout-to-video",
  "ltx-deploy-akuspace",
  "flux-3",
  "flux-3-i2v",
  "minimax-h3",
  "minimax-h3-canny",
  "minimax-h3-depth",
  "minimax-h3-combined",
  "minimax-h3-router",
  "ltx-2.5",
  "ltx-2.5-pro",
  "ltx-2.5-open",
  "ltx-2.5-akuspace",
  "flux-3-klein",
  "flux-3-klein-api",
  "openjutsu-swap",
  "minimax-music-3",
  "seedvr2-upscale",
] as const satisfies readonly VideoModel[];
const aspectRatios = [
  "21:9",
  "2:1",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
] as const satisfies readonly AspectRatio[];
const resolutions = [
  "hd",
  "fhd",
  "qhd",
  "uhd",
] as const satisfies readonly VideoResolution[];

const camera = z
  .strictObject(
    Object.fromEntries(
      cameraSections.map((section) => [
        section.id,
        choices(section.terms.map((term) => term.id))
          .nullable()
          .optional()
          .describe(`${section.label}: one term, or null for none`),
      ]),
    ),
  )
  .describe("One camera term per section; omitted sections are none");

const acoustic = z
  .object({
    mode: choices(acousticSections.map((section) => section.id)),
    preset: z.string(),
    level: z.string(),
    text: z.string().optional(),
  })
  .refine((value) => readAcoustic(value) !== undefined, {
    message: "Choose a preset and level that belong to that acoustic mode.",
  })
  .nullable()
  .optional()
  .describe("Acoustic Space treatment; the ltx-2.5-akuspace model only");

export const generationShape = {
  generator: z
    .enum(generators)
    .describe(
      "video (text to video), upscale, image, edit or audio (music: MiniMax Music 3, one candidate per quote)",
    ),
  model: z
    .enum(models)
    .optional()
    .describe(
      "Model. Video: flux-3 (text), flux-3-i2v (BFL keyframes), ltx-*, minimax-h3[-canny|-depth|-combined] (Comfy reference workflow with a guide video), minimax-h3-router (two reference images on Comfy Router, 4-15 s, hd = 768P, fhd = 2K) or openjutsu-swap (character swap on its Comfy deployment; needs sourceId, imageReferences [character, first frame?], duration 5-15 and swap). Images: flux-3-klein (open graph, Comfy key), flux-3-klein-api (BFL key; references, first image edited, box rows in the description) or flux-3; edits run on flux-3. Upscales: flux-3 (FLUX Video Upscale, paid API, either key) or seedvr2-upscale (SeedVR2 3B, open weights, Comfy workflow: free on a local ComfyUI, a Comfy key on Comfy Cloud; no prompt, no creativity, at most 13.75 MP a frame). Audio: minimax-music-3 (open workflow, Comfy key)",
    ),
  description: z
    .string()
    .describe(
      "The scene or image to make, or for audio the music caption (style, mood, tempo, instruments); the server bounds its length",
    ),
  lyrics: z
    .string()
    .optional()
    .describe(
      "Audio only: lyrics with section tags such as [verse], [chorus], [Instrumental]; empty or omitted is sent empty",
    ),
  camera: camera.optional(),
  cameraEdits: z
    .record(z.string(), z.string())
    .optional()
    .describe("Reworded camera phrases, keyed by a selected term id"),
  presetId: choices(presets.map((preset) => preset.id))
    .optional()
    .describe("A camera preset, when no camera selection is sent"),
  cameraText: z.string().optional(),
  cameraEnabled: z
    .boolean()
    .optional()
    .describe("Add the camera wording to the prompt (default false)"),
  duration: z
    .number()
    .int()
    .optional()
    .describe(
      "Whole seconds; the model sets the range. Video, or audio (5 to 120: a ceiling, not the length; the model ends the song when it chooses, often sooner)",
    ),
  resolution: z.enum(resolutions).optional().describe("Video resolution"),
  aspectRatio: z.enum(aspectRatios).optional().describe("Default 16:9"),
  draft: z.boolean().optional().describe("FLUX 3 draft (default false)"),
  acoustic,
  sourceId: z
    .string()
    .optional()
    .describe(
      "The source clip: upscale input, H3 video guide or the clip a swap changes",
    ),
  upscalePrompt: z.string().optional(),
  upscaleFactor: z
    .number()
    .optional()
    .describe("Upscale amount, 1.5 to 3 (default 2)"),
  upscaleCreativity: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .describe("0 precise, 1 creative"),
  imageReferences: z
    .array(z.string())
    .max(MAX_IMAGE_REFERENCES)
    .optional()
    .describe(
      "PNG/JPEG/WebP data URLs. H3: exactly two, identity then look; H3 on Router: exactly two, character sheet then storyboard; FLUX i2v: one to ten ordered keyframes; Edit: source first; openjutsu-swap: the character, then the first frame (a Klein box edit) if any",
    ),
  projectImageReferences: z
    .array(projectAssetSchema)
    .min(1)
    .max(MAX_IMAGE_REFERENCES)
    .optional()
    .describe(
      "Image assets of linked projects, in reference order. The adapter resolves their bytes; use instead of imageReferences. Read the full brief's reference bindings from genobi_project.",
    ),
  deploy: z
    .strictObject({
      seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      negativePrompt: z.string().max(12000),
      recipe: z.string().max(64000).optional(),
      assets: z.partialRecord(z.enum(DEPLOY_FILE_TOKENS), z.string().uuid()),
    })
    .optional()
    .describe(
      "ltx-deploy-* only: staged ownership tickets from genobi_deployment_stage, seed, negative prompt and the capture recipe. Tickets expire after two hours; quote and submit in the same session and endpoint.",
    ),
  swap: z
    .object({
      start: z
        .number()
        .nonnegative()
        .optional()
        .describe("Where the part starts in the clip, seconds (default 0)"),
      size: z
        .union([z.literal(480), z.literal(768)])
        .describe("The size H3 prepares the part at"),
      seed: z
        .number()
        .int()
        .min(0)
        .max(2 ** 32 - 1)
        .describe("Whole-number seed; pick a new one per run"),
      items: z
        .array(z.string())
        .max(8)
        .optional()
        .describe(
          "The items the first frame's boxes changed (hat, shirt), when they were items and not the whole person",
        ),
    })
    .optional()
    .describe(
      "openjutsu-swap only: the part's start, size and seed; duration is the part's length and description the direction (500 characters)",
    ),
  imageResolution: choices(KLEIN_RESOLUTIONS)
    .optional()
    .describe("Image tier; 1.5k is Klein only, the server bounds it per model"),
  imageAspectRatio: choices(IMAGE_ASPECT_RATIOS).optional(),
  imageGrounding: z.boolean().optional(),
  imageSafetyTolerance: z.number().int().optional(),
  projectRevision: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("The Director project revision this take is for"),
} satisfies z.ZodRawShape;

export const quoteIdField = z
  .string()
  .regex(QUOTE_ID)
  .describe("The quoteId from genobi_quote that the person accepted");

export const idempotencyKeyField = z
  .string()
  .regex(IDEMPOTENCY_KEY)
  .describe(
    "8 to 100 letters, digits, _ or -, new for each intended run. Reusing it with the same inputs replays the first run and never pays twice.",
  );

/**
 * The body both paid routes receive. Quote and submit build it the same way,
 * so the same arguments always price and spend the same settings. Defaults
 * fill only what the server requires and the person did not choose.
 */
export function generationBody(args: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  for (const field of Object.keys(generationShape))
    if (field !== "projectImageReferences" && args[field] !== undefined)
      body[field] = args[field];
  if (body.generator === "video" || body.generator === "upscale") {
    body.cameraEnabled ??= false;
    body.draft ??= false;
    body.upscaleFactor ??= 2;
  }
  const selection = body.camera as Record<string, unknown> | undefined;
  if (selection)
    body.camera = Object.fromEntries(
      cameraSections.map((section) => [
        section.id,
        selection[section.id] ?? null,
      ]),
    );
  return body;
}

/** Quote and submit resolve the same scoped references, so changed bytes fail quote matching. */
export async function resolvedGenerationBody(
  api: GenobiApi,
  args: Record<string, unknown>,
) {
  const body = generationBody(args);
  if (args.projectImageReferences !== undefined) {
    if (Array.isArray(args.imageReferences) && args.imageReferences.length)
      throw new Error(
        "Use projectImageReferences or imageReferences, not both.",
      );
    body.imageReferences = await projectImageReferences(
      api,
      args.projectImageReferences,
    );
  }
  if (
    body.model === "flux-3-klein" &&
    Array.isArray(body.imageReferences) &&
    body.imageReferences.length
  )
    body.imageAspectRatio ??= "auto";
  return body;
}
