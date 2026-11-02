import type { Project } from "../../shared/director/types";
import { BLOOM_PROMPT, BLOOM_SHEET } from "../../shared/templates/bloom-teaser";
import type { VersionSlot } from "../../shared/templates/version";
import { versionTemplate } from "../../shared/templates/version";
import { readyEntry, type ReadyEntry } from "../../shared/registry";
import { applyCameraRecipe } from "../camera-recipe-target";
import { fillPrompt, promptById } from "../voice/prompt-target";

/**
 * Recreate in Camera (#57, swap only): a template slot's way to new media.
 * It never generates and never swaps anything in. It opens Camera and
 * restores what the slot's media actually records: a generated asset's
 * prompt, the registry entry that made it (model and route, so the right
 * Camera model is selected), and its image references and inputs from the
 * project's own files. Bloom's untouched bundled takes carry the owner's
 * recorded prompt and character sheet. Anything not stored is named in
 * Camera's notice line; nothing is invented. The person runs Camera
 * themselves; the result lands in Assets → Generated.
 */
export interface CameraRecipe {
  label: "Recreate in Camera" | "Create in Camera";
  prompt?: string;
  /** The registry entry that made it, when the project recorded one. */
  entry?: ReadyEntry;
  /** Project image assets the run read (references, then inputs). */
  imageIds: string[];
  /** A recorded static reference image (Bloom's sheet). */
  reference?: string;
  /** What this asset does not record, said in Camera. */
  missing: string[];
}

/**
 * Prompts recorded for a finished mix's bundled media, by template and slot.
 * Only what the repository records: Bloom's owner prompt and its character
 * sheet (`shared/templates/bloom-teaser.ts`), not which H3 entry ran them.
 * Dimensions records cut points, not per-creature prompts, so it has none.
 */
const RECORDED: Record<
  string,
  Record<string, { prompt: string; reference: string }>
> = {
  "bloom-teaser": {
    "bloom-h3-a": { prompt: BLOOM_PROMPT, reference: BLOOM_SHEET },
    "bloom-h3-b": { prompt: BLOOM_PROMPT, reference: BLOOM_SHEET },
  },
};

const CREATE: CameraRecipe = {
  label: "Create in Camera",
  imageIds: [],
  missing: ["prompt, references and settings"],
};

/** What Recreate can restore for the slot's current media, if anything. */
export function cameraRecipe(
  project: Project,
  slot: VersionSlot,
  ids: readonly string[],
): CameraRecipe {
  const id = ids[0];
  const asset =
    id && Object.hasOwn(project.assets, id) ? project.assets[id] : undefined;
  const generation = asset?.generationId
    ? project.generations.find((g) => g.id === asset.generationId)
    : undefined;
  const prompt = generation?.prompt.trim();
  if (generation && prompt) {
    const entry = generation.recipe && readyEntry(generation.recipe.id);
    const read = [...generation.referenceAssetIds, ...generation.inputAssetIds];
    const imageIds = [...new Set(read)].filter(
      (a) => project.assets[a]?.kind === "image",
    );
    const missing: string[] = [];
    if (!entry) missing.push("model and settings");
    // A project video the run read is never a Camera library clip, whatever
    // recorded (or did not record) the model.
    if (read.some((a) => project.assets[a]?.kind === "video"))
      missing.push("source video (choose it in Camera)");
    return {
      label: "Recreate in Camera",
      prompt,
      ...(entry ? { entry } : {}),
      imageIds,
      missing,
    };
  }
  const template = versionTemplate(project);
  const recorded = template && RECORDED[template.id]?.[slot.id];
  // The bundled take itself: the slot's own asset at the template's path (a
  // swap imports a new asset under another id).
  if (
    recorded &&
    id === slot.defaultAsset &&
    asset?.file.path === template.mix?.media[slot.id]?.path
  )
    return {
      label: "Recreate in Camera",
      ...recorded,
      imageIds: [],
      missing: ["model and settings"],
    };
  return CREATE;
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

async function dataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/** The recipe's images as data URLs, from project files or a same-origin URL. */
export async function recipeImages(
  recipe: CameraRecipe,
  project: Project,
  files: ReadonlyMap<string, Uint8Array>,
  load: typeof fetch = fetch,
) {
  const out: string[] = [];
  for (const id of recipe.imageIds) {
    const path = project.assets[id]?.file.path ?? "";
    const type = IMAGE_TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
    const bytes = files.get(path);
    if (type && bytes)
      out.push(await dataUrl(new Blob([bytes.slice()], { type })));
  }
  if (recipe.reference?.startsWith("/")) {
    const response = await load(recipe.reference);
    if (response.ok) out.push(await dataUrl(await response.blob()));
  }
  return out;
}

/** Camera's notice for a recipe: what was restored and what was not. */
export function recipeNote(recipe: CameraRecipe, images: number) {
  if (recipe.label === "Create in Camera")
    return "Settings not stored for this asset: Camera opened as it was. Nothing was generated.";
  const recorded = recipe.imageIds.length + (recipe.reference ? 1 : 0);
  const missing = [...recipe.missing];
  if (recorded > images) missing.push("reference images (reattach them)");
  const restored = [
    "prompt",
    ...(recipe.entry ? ["model"] : []),
    ...(images ? ["references"] : []),
  ];
  const list =
    restored.length > 1
      ? `${restored.slice(0, -1).join(", ")} and ${restored.at(-1)}`
      : restored[0];
  return [
    `Restored this asset's ${list}.`,
    // Camera's earlier references are cleared either way, so a Generate
    // never sends images this asset did not record.
    ...(recorded ? [] : ["No references recorded; Camera's were cleared."]),
    ...(missing.length ? [`Not stored: ${missing.join(", ")}.`] : []),
    "Nothing was generated.",
  ].join(" ");
}

/**
 * Opens Camera and hands the composer the recipe: model, prompt and
 * references, as an edit. With no composer registered it types the prompt
 * into Camera's field once it is on screen. Generate is never pressed.
 */
export async function openInCamera(
  select: (preset: "camera") => void,
  recipe: CameraRecipe,
  project: Project,
  files: ReadonlyMap<string, Uint8Array>,
) {
  select("camera");
  const images = await recipeImages(recipe, project, files).catch(
    () => [] as string[],
  );
  const note = recipeNote(recipe, images.length);
  if (recipe.label === "Create in Camera") {
    applyCameraRecipe({ patch: {}, note });
    return;
  }
  const patch = {
    ...(recipe.entry
      ? { generator: recipe.entry.generator, model: recipe.entry.videoModel }
      : {}),
    // An upscale's words are its own prompt field, not the description.
    ...(recipe.prompt
      ? recipe.entry?.generator === "upscale"
        ? { upscalePrompt: recipe.prompt }
        : { description: recipe.prompt }
      : {}),
    // Always replaced, as the restore reducer does: an earlier run's
    // references or boxes must not ride along into a paid Generate.
    imageReferences: images,
    imageRegions: [],
  };
  if (applyCameraRecipe({ patch, note })) return;
  const prompt = recipe.prompt;
  if (!prompt || typeof requestAnimationFrame === "undefined") return;
  let frames = 30;
  const tryFill = () => {
    const field = promptById("description");
    if (field) fillPrompt(prompt, field);
    else if (--frames > 0) requestAnimationFrame(tryFill);
  };
  requestAnimationFrame(tryFill);
}
