/**
 * A Camera run sent to the Director keeps its recipe (#64 follow-up): the
 * output lands as a generated asset with a project generation that records
 * the prompt, the public recipe identity (model, route, run location) and
 * the run's public settings, and the run's reference images are copied in as
 * Inspirations, so a Recreate from the project restores the run from the
 * project's own bytes. The same record the Scrolls handoff and an agent's
 * take hand-in write (`src/scrolls/director.ts`, `server/project-takes.ts`).
 *
 * One commit, so one Undo reverts the whole send. Job and provider ids, the
 * session and keys never enter the project.
 */
import type { Job } from "../../shared/types";
import type { Project } from "../../shared/director/types";
import { publicGenerationRecipe } from "../../shared/director/generation-recipe";
import { publicGenerationSettings } from "../../shared/director/generation-settings";
import { entryFor } from "../../shared/registry";
import { importAssets } from "../director/import-media";
import { validateProject } from "../director/validate";
import { runInputStore, restoredRunInputs } from "../run-inputs";
import { studioStore, type createStudioStore } from "./store";

type Store = ReturnType<typeof createStudioStore>;
type Generation = Project["generations"][number];

/** What a Camera job contributes to the project, beyond its output bytes. */
export interface CameraGeneration {
  prompt: string;
  tool: string;
  recipe?: Generation["recipe"];
  settings?: Generation["settings"];
  /** The run's reference images, copied as Inspirations. */
  references: File[];
}

const IMAGE_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function referenceFiles(urls: readonly string[], load: typeof fetch) {
  const files: File[] = [];
  for (const [i, url] of urls.entries()) {
    if (!url.startsWith("data:image/")) continue;
    const blob = await (await load(url)).blob();
    const ext = IMAGE_EXTENSION[blob.type];
    if (ext)
      files.push(
        new File([blob], `reference-${i + 1}.${ext}`, { type: blob.type }),
      );
  }
  return files;
}

/**
 * The record for a Camera job: its take's public recipe when the server
 * holds one (run location included), else the registry entry it names; its
 * settings by the public allowlist; its references from this browser's
 * private run inputs, when they are still kept here.
 */
export async function cameraGeneration(
  job: Job,
  load: typeof fetch = fetch,
  inputs = runInputStore,
): Promise<CameraGeneration> {
  let recipe: Generation["recipe"];
  try {
    const response = await load(`/api/takes/${encodeURIComponent(job.id)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok)
      recipe = publicGenerationRecipe(
        ((await response.json()) as { take?: { recipe?: unknown } }).take
          ?.recipe,
      );
  } catch {
    // An unreadable take still records the entry below.
  }
  if (!recipe) {
    const entry = entryFor(job.generator, job.model);
    recipe = publicGenerationRecipe({
      id: entry.id,
      version: entry.recipeVersion,
      route:
        job.imageProvider === "bfl"
          ? "bfl"
          : job.imageProvider === "comfy"
            ? "router"
            : entry.route,
    });
  }
  const stored = await inputs.load(job.id).catch(() => undefined);
  const urls = restoredRunInputs(job, stored).imageReferences ?? [];
  const references = await referenceFiles(urls, load).catch(() => []);
  const settings = publicGenerationSettings({
    ...job,
    // The browser's own wording for an image run (regions not composed in).
    ...(urls.length && stored ? { description: stored.description } : {}),
  });
  return {
    prompt: job.prompt.slice(0, 2000),
    tool: "Genobi Camera",
    ...(recipe ? { recipe } : {}),
    ...(settings ? { settings } : {}),
    references,
  };
}

/**
 * Import the output and its references and record the generation, as one
 * edit. An output the project already holds as a plain upload (sent before
 * this record existed) is upgraded in place; one already generated is kept.
 */
export async function importCameraGeneration(
  file: File,
  use: "production" | "reference",
  generation: CameraGeneration,
  store: Store = studioStore,
) {
  const state = store.getState(),
    before = state.director.bundle;
  if (!before) throw new Error("Open a project first");
  if (Object.values(state.operations).some(Boolean))
    throw new Error("Wait for the current edit or render to finish");
  state.actions.operations({ workingFile: true });
  try {
    const refs = generation.references.length
      ? await importAssets(before, generation.references, "reference")
      : { bundle: before, assetIds: [] as string[] };
    const out = await importAssets(refs.bundle, [file], use);
    const assetId = out.assetIds[0];
    // Already a generated asset here: nothing to add, references included.
    if (before.project.assets[assetId]?.origin === "generated")
      return { assetIds: [assetId] };
    const project = structuredClone(out.bundle.project);
    project.revision = before.project.revision + 1;
    const asset = project.assets[assetId];
    if (asset && asset.origin !== "generated") {
      const id = `generation-${crypto.randomUUID().slice(0, 8)}`;
      asset.origin = "generated";
      asset.generationId = id;
      project.generations.push({
        id,
        inputAssetIds: [],
        referenceAssetIds: [...new Set(refs.assetIds)].filter(
          (ref) => ref !== assetId,
        ),
        outputAssetIds: [assetId],
        prompt: generation.prompt,
        tool: generation.tool,
        ...(generation.recipe ? { recipe: generation.recipe } : {}),
        ...(generation.settings ? { settings: generation.settings } : {}),
      });
    }
    validateProject(project);
    if (store.getState().director.bundle !== before)
      throw new Error("Project changed while the tool was running; retry");
    state.actions.commit({ project, files: out.bundle.files }, before);
    return { assetIds: [assetId] };
  } finally {
    state.actions.operations({ workingFile: false });
  }
}
