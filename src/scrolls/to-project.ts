/**
 * Scrolls outputs into the open project's assets, through the one path
 * (`addToProjectAssets`): **Send to Director** and **Add to assets** on a
 * result, and every generated result as it arrives. The bytes are the
 * scroll's own, already measured when they joined the scroll; the project's
 * importer measures them again and deduplicates by hash.
 */
import type { AssetUse } from "../../shared/director/asset-media";
import type { AssetRole } from "../../shared/scrolls/types";
import { copyAvailable } from "../director/project-copy";
import {
  addToProjectAssets,
  addedMessage,
  type AddAsset,
  type OutputMedia,
} from "../studio/project-assets";
import { assetType, type ScrollBundle } from "./bundle";

/**
 * Send to Director files a character or style sheet under Inspirations,
 * where the Director's prompt takes references; a panel or audio under
 * Project, as media to place.
 */
export const directorUse = (role: AssetRole): AssetUse =>
  role === "character" || role === "style" ? "reference" : "production";

/** One scroll asset as project media, under the use given. */
export function scrollMedia(
  bundle: ScrollBundle,
  assetId: string,
  use: AssetUse,
): OutputMedia {
  const asset = bundle.document.assets.find((a) => a.id === assetId);
  if (!asset) throw new Error("This result is no longer in the scroll.");
  const bytes = bundle.files.get(asset.file.path);
  if (!bytes) throw new Error("This result is missing its media. Reattach it.");
  return {
    blob: new Blob([bytes], { type: assetType(asset) }),
    filename: asset.name,
    use,
  };
}

/** Said on the hosted site, which keeps no project copy (project-assets.md). */
export const HOSTED_NOTE =
  "Project assets on the hosted site last until you reload; download the bundle to keep the project.";

// A copy found is remembered; a miss is asked again next time, so a local
// server that was restarting is not taken for the hosted site for good.
let copy: Promise<boolean> | undefined;
const hasCopy = () =>
  (copy ??= copyAvailable().then((found) => {
    if (!found) copy = undefined;
    return found;
  }));

/**
 * A generated result lands under Project as it arrives. The result is
 * already in the scroll, so a refusal here is said, never thrown: the
 * returned sentence joins the Scrolls message.
 */
export async function landInProject(
  bundle: ScrollBundle,
  assetId: string,
  add: AddAsset = addToProjectAssets,
  copyKept: () => Promise<boolean> = hasCopy,
): Promise<string> {
  try {
    const added = await add(scrollMedia(bundle, assetId, "production"));
    return (await copyKept())
      ? addedMessage(added)
      : `${addedMessage(added)} ${HOSTED_NOTE}`;
  } catch (error) {
    return `Not added to project assets: ${
      error instanceof Error ? error.message : "the project refused it."
    }`;
  }
}
