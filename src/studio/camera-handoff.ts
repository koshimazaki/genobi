import type { Project } from "../../shared/director/types";
import type { Bundle } from "../director/bundle";
import {
  applyCameraRecipe,
  beginCameraRecipeHandoff,
  currentCameraRecipeHandoff,
} from "../camera-recipe-target";
import { generatedRecipe, openInCamera } from "../director/recreate-in-camera";
import { readReference } from "../image-files";
import { projectAssetFile } from "./media-drop";
import { studioStore } from "./store";

/** The control an expanded Assets card offers for Camera, if any. */
export interface AssetCameraAction {
  label: "Recreate" | "Use in Camera";
  title: string;
}

const REFERENCE_TYPES = /\.(png|jpe?g|webp)$/i;

/**
 * "Recreate" when the asset's own run recorded a prompt (Camera opens with
 * it, as a template slot's Recreate in Camera does), "Use in Camera" when it
 * did not but Camera can take the file itself: a PNG, JPEG or WebP as Edit's
 * reference, an MP4 as Upscale's source. Audio and other files get none.
 */
export function assetCameraAction(
  project: Project,
  id: string,
): AssetCameraAction | undefined {
  if (generatedRecipe(project, id))
    return {
      label: "Recreate",
      title:
        "Opens Camera with what this asset records (prompt, model, references). Nothing is generated.",
    };
  const asset = Object.hasOwn(project.assets, id)
    ? project.assets[id]
    : undefined;
  const path = asset?.file.path ?? "";
  if (asset?.kind === "image" && REFERENCE_TYPES.test(path))
    return {
      label: "Use in Camera",
      title:
        "No prompt recorded: opens Camera's Edit with this image as its reference. Nothing is generated.",
    };
  if (asset?.kind === "video" && /\.mp4$/i.test(path))
    return {
      label: "Use in Camera",
      title:
        "No prompt recorded: uploads this MP4 as Upscale's source in Camera. Nothing is generated.",
    };
  return undefined;
}

/**
 * Opens Camera with a project asset. A recorded run goes through the slot's
 * own path (`openInCamera`). Otherwise the file itself is handed over: an
 * image replaces Camera's references (so a Generate never sends ones this
 * asset did not choose), a video is uploaded as Upscale's source by the
 * composer. Nothing is generated; Generate stays the person's.
 */
export async function sendAssetToCamera(
  select: (preset: "camera") => void,
  bundle: Bundle,
  id: string,
) {
  const recipe = generatedRecipe(bundle.project, id);
  if (recipe) return openInCamera(select, recipe, bundle.project, bundle.files);
  const file = projectAssetFile(bundle, id);
  const kind = bundle.project.assets[id]!.kind;
  const generation = beginCameraRecipeHandoff();
  const projectBefore = studioStore.getState().director.bundle?.project.id;
  const current = () =>
    currentCameraRecipeHandoff(generation) &&
    studioStore.getState().director.bundle?.project.id === projectBefore;
  select("camera");
  if (kind === "video") {
    applyCameraRecipe({
      patch: { generator: "upscale" },
      note: `Uploading ${file.name} as Upscale's source. Nothing was generated.`,
      video: file,
    });
    return;
  }
  let reference: string;
  try {
    reference = await readReference(file);
  } catch (error) {
    reference = "";
    if (current())
      applyCameraRecipe({
        patch: {},
        note: `${error instanceof Error ? error.message : "Could not read this image."} Camera opened as it was.`,
      });
  }
  if (!reference || !current()) return;
  applyCameraRecipe({
    patch: {
      generator: "edit",
      model: "flux-3",
      imageReferences: [reference],
      imageRegions: [],
      imageAspectRatio: "auto",
    },
    note: `${file.name} is Edit's reference; earlier references were cleared. Nothing was generated.`,
  });
}
