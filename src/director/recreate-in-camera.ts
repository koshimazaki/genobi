import type { Project } from "../../shared/director/types";
import type { VersionSlot } from "../../shared/templates/version";
import { versionTemplate } from "../../shared/templates/version";
import { readyEntry, type ReadyEntry } from "../../shared/registry";
import {
  applyCameraRecipe,
  beginCameraRecipeHandoff,
  currentCameraRecipeHandoff,
} from "../camera-recipe-target";
import { studioStore } from "../studio/store";
import type { Job } from "../../shared/types";
import {
  publicGenerationSettings,
  settingsJob,
} from "../../shared/director/generation-settings";
import { recreateGaps } from "../recreate-gaps";

/**
 * Recreate in Camera (#57, swap only): a template slot's way to new media.
 * It never generates and never swaps anything in. It opens Camera and
 * restores what the slot's media actually records: a generated asset's
 * prompt, the registry entry that made it (model and route, so the right
 * Camera model is selected), and its image references and inputs from the
 * project's own files. A template's untouched bundled take restores what
 * the template records for its slot (`mix.recipes`): the still it started
 * from, the prompt when written down, and its preset, named in Camera's
 * notice. Anything not stored is named in
 * Camera's notice line; nothing is invented. The person runs Camera
 * themselves; the result lands in Assets → Generated.
 *
 * A Camera run sent to the Director records its public settings on the
 * generation (`shared/director/generation-settings.ts`): then the whole run
 * comes back through Camera's own restore (duration, aspect, resolution,
 * camera, LTX gaps and Light, swap, a deployment's seed, image options) and
 * its run location, and `recreate-gaps.ts` names what the project does not
 * hold.
 */
export interface CameraRecipe {
  label: "Recreate in Camera" | "Create in Camera";
  prompt?: string;
  /** The registry entry that made it, when the project recorded one. */
  entry?: ReadyEntry;
  /** Project image assets the run read (references, then inputs). */
  imageIds: string[];
  /** A recorded static reference image (a template's first still). */
  reference?: string;
  /** A recorded shape-guide image, attached before `reference`. */
  guide?: string;
  /** Where a recorded still came from (`SlotRecipe.source`). */
  stillSource?: string;
  /** The preset a bundled take was made from, named in Camera's notice. */
  preset?: string;
  /** What this asset does not record, said in Camera. */
  missing: string[];
  /** FLUX 3 stills: the provider the run used, as Camera's choice. */
  imageProvider?: "bfl" | "comfy";
  /** The recorded settings as a job for Camera's restore, when recorded. */
  job?: Job;
  /** A workflow run's recorded run location. */
  location?: "local" | "cloud";
}

/** Camera's gap names, in the words a Director notice uses. */
const GAP_WORDS: Record<string, string | undefined> = {
  "source video": "source video (choose it in Camera)",
  "deployment inputs": "deployment inputs",
  "deployment input files": "deployment input files (reattach them)",
  "swap settings": "swap settings",
  // Counted against the images restored, and said by `recordedProvider`.
  "reference images": undefined,
  provider: undefined,
};

/**
 * The provider a run used, as far as Camera has a choice for it. Only FLUX 3
 * stills (image and edit) carry one (`imageProvider`): BFL direct or Comfy
 * Router. Klein's open and API runs are separate models, restored as such.
 * Any other entry's route follows the connected key, so a run recorded on a
 * route the entry does not default to is named, never silently changed.
 */
export function recordedProvider(
  entry: ReadyEntry,
  route: string | undefined,
): { imageProvider?: "bfl" | "comfy"; missing?: string } {
  const still =
    (entry.generator === "image" || entry.generator === "edit") &&
    entry.videoModel === "flux-3";
  if (still) {
    if (route === "bfl") return { imageProvider: "bfl" };
    if (route === "router") return { imageProvider: "comfy" };
    return { missing: "provider (BFL or Comfy) not recorded" };
  }
  if (route && route !== entry.route)
    return {
      missing: `provider: it ran on ${route === "bfl" ? "BFL direct" : route}; Camera picks the route from your connected key`,
    };
  return {};
}

const CREATE: CameraRecipe = {
  label: "Create in Camera",
  imageIds: [],
  missing: ["prompt, references and settings"],
};

/**
 * What a generated asset's own run records: its prompt, the registry entry
 * that made it and the project images it read. Undefined when the asset has
 * no generation or its generation recorded no prompt. Shared by a template
 * slot and the expanded Assets gallery (`src/studio/camera-handoff.ts`).
 */
export function generatedRecipe(
  project: Project,
  id: string | undefined,
): CameraRecipe | undefined {
  const asset =
    id && Object.hasOwn(project.assets, id) ? project.assets[id] : undefined;
  const generation = asset?.generationId
    ? project.generations.find((g) => g.id === asset.generationId)
    : undefined;
  const prompt = generation?.prompt.trim();
  if (!generation || !prompt) return undefined;
  const entry = generation.recipe && readyEntry(generation.recipe.id);
  const read = [...generation.referenceAssetIds, ...generation.inputAssetIds];
  const imageIds = [...new Set(read)].filter(
    (a) => project.assets[a]?.kind === "image",
  );
  const missing: string[] = [];
  if (!entry) missing.push("model and settings");
  const provider = entry
    ? recordedProvider(entry, generation.recipe?.route)
    : {};
  if (provider.missing) missing.push(provider.missing);
  const settings = publicGenerationSettings(generation.settings);
  const job =
    settings && entry
      ? settingsJob(
          {
            ...settings,
            generator: entry.generator,
            model: entry.videoModel,
          },
          prompt,
        )
      : undefined;
  if (job)
    for (const gap of recreateGaps(job)) {
      const words = GAP_WORDS[gap];
      if (words && !missing.includes(words)) missing.push(words);
    }
  else if (entry) missing.push("settings (duration, aspect, camera)");
  // A project video the run read is never a Camera library clip, whatever
  // recorded (or did not record) the model.
  const source = "source video (choose it in Camera)";
  if (
    read.some((a) => project.assets[a]?.kind === "video") &&
    !missing.includes(source)
  )
    missing.push(source);
  const location = generation.recipe?.location;
  return {
    label: "Recreate in Camera",
    prompt,
    ...(entry ? { entry } : {}),
    ...(provider.imageProvider
      ? { imageProvider: provider.imageProvider }
      : {}),
    ...(job ? { job } : {}),
    ...(entry?.route === "workflow" &&
    (location === "local" || location === "cloud")
      ? { location }
      : {}),
    imageIds,
    missing,
  };
}

/** What Recreate can restore for the slot's current media, if anything. */
export function cameraRecipe(
  project: Project,
  slot: VersionSlot,
  ids: readonly string[],
): CameraRecipe {
  const id = ids[0];
  const generated = generatedRecipe(project, id);
  if (generated) return generated;
  const asset =
    id && Object.hasOwn(project.assets, id) ? project.assets[id] : undefined;
  const template = versionTemplate(project);
  const recorded = template?.mix?.recipes?.[slot.id];
  // The bundled take itself: the slot's own asset at the template's path (a
  // swap imports a new asset under another id).
  if (
    recorded &&
    id === slot.defaultAsset &&
    asset?.file.path === template.mix?.media[slot.id]?.path
  )
    return {
      label: "Recreate in Camera",
      ...(recorded.prompt ? { prompt: recorded.prompt } : {}),
      reference: recorded.reference,
      ...(recorded.guide ? { guide: recorded.guide } : {}),
      ...(recorded.source ? { stillSource: recorded.source } : {}),
      ...(recorded.preset ? { preset: recorded.preset } : {}),
      imageIds: [],
      missing: [...(recorded.missing ?? []), "model and settings"],
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
  // The shape guide first, then the still, as the run that made it read them.
  for (const url of [recipe.guide, recipe.reference])
    if (url?.startsWith("/")) {
      const response = await load(url);
      if (response.ok) out.push(await dataUrl(await response.blob()));
    }
  return out;
}

/** How Camera's notice names a recorded still's source. */
const STILL_SOURCES: Record<string, string> = {
  "ltx-video frame": "First still taken from an LTX video.",
};

/** Camera's notice for a recipe: what was restored and what was not. */
export function recipeNote(recipe: CameraRecipe, images: number) {
  if (recipe.label === "Create in Camera")
    return "Settings not stored for this asset: Camera opened as it was. Nothing was generated.";
  const recorded =
    recipe.imageIds.length +
    (recipe.reference ? 1 : 0) +
    (recipe.guide ? 1 : 0);
  const missing = [...recipe.missing];
  if (recorded > images) missing.push("reference images (reattach them)");
  const restored = [
    ...(recipe.prompt ? ["prompt"] : []),
    ...(recipe.entry ? ["model"] : []),
    ...(recipe.job ? ["settings"] : []),
    ...(recipe.location ? ["run location"] : []),
    ...(images ? ["references"] : []),
  ];
  const list =
    restored.length > 1
      ? `${restored.slice(0, -1).join(", ")} and ${restored.at(-1)}`
      : restored[0];
  const unstored = missing.length
    ? recipe.preset
      ? [`Made from preset ${recipe.preset}; ${missing.join(", ")} not stored.`]
      : [`Not stored: ${missing.join(", ")}.`]
    : recipe.preset
      ? [`Made from preset ${recipe.preset}.`]
      : [];
  const source = recipe.stillSource
    ? [
        STILL_SOURCES[recipe.stillSource] ??
          `First still: ${recipe.stillSource}.`,
      ]
    : [];
  return [
    list ? `Restored this asset's ${list}.` : "Nothing could be restored.",
    ...source,
    // Camera's earlier references are cleared either way, so a Generate
    // never sends images this asset did not record.
    ...(recorded ? [] : ["No references recorded; Camera's were cleared."]),
    ...unstored,
    "Nothing was generated.",
  ].join(" ");
}

/**
 * Opens Camera and hands the composer the recipe: model, prompt and
 * references, as an edit. When the composer has not mounted yet, the recipe
 * waits and lands, whole, as soon as it does (`camera-recipe-target.ts`).
 * Generate is never pressed.
 */
export async function openInCamera(
  select: (preset: "camera") => void,
  recipe: CameraRecipe,
  project: Project,
  files: ReadonlyMap<string, Uint8Array>,
) {
  // Reserve intent *before* the async reference load. A newer Recreate,
  // project switch or navigation away from Camera invalidates this request.
  const generation = beginCameraRecipeHandoff();
  const projectBefore = studioStore.getState().director.bundle?.project.id;
  select("camera");
  const images = await recipeImages(recipe, project, files).catch(
    () => [] as string[],
  );
  if (
    !currentCameraRecipeHandoff(generation) ||
    studioStore.getState().director.bundle?.project.id !== projectBefore
  )
    return;
  const note = recipeNote(recipe, images.length);
  if (recipe.label === "Create in Camera") {
    applyCameraRecipe({ patch: {}, note });
    return;
  }
  const patch = {
    ...(recipe.entry
      ? { generator: recipe.entry.generator, model: recipe.entry.videoModel }
      : {}),
    ...(recipe.imageProvider ? { imageProvider: recipe.imageProvider } : {}),
    // An upscale's words are its own prompt field, not the description. A
    // recorded job restores the person's own words (the description before
    // camera, scene and Light wording were composed into `recipe.prompt`), so
    // the composed prompt never lands over them to be composed a second time.
    ...(recipe.prompt
      ? recipe.entry?.generator === "upscale"
        ? recipe.job?.upscalePrompt === undefined
          ? { upscalePrompt: recipe.prompt }
          : {}
        : recipe.job
          ? {}
          : { description: recipe.prompt }
      : {}),
    // Always replaced, as the restore reducer does: an earlier run's
    // references or boxes must not ride along into a paid Generate.
    imageReferences: images,
    imageRegions: [],
  };
  applyCameraRecipe({
    patch,
    note,
    ...(recipe.job ? { job: recipe.job } : {}),
    ...(recipe.location ? { location: recipe.location } : {}),
  });
}
