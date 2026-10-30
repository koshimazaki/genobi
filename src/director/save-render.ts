/**
 * Where a rendered video lives. Locally the project copy on this computer
 * keeps the project's assets, so the render is added there and survives a
 * reload. The hosted studio has no project copy (`copyAvailable`), so a
 * render held only in the browser's project would be gone on reload: there it
 * is first saved to the visitor's private library (R2, through the same
 * `/api/uploads` as before), then added to the project's assets for this
 * session. The visitor's key travels in the upload's header only; it is never
 * stored or logged.
 */
import {
  addToProjectAssets,
  addedMessage,
  type AddAsset,
} from "../studio/project-assets";
import { saveVideo, UploadOutcomeUnknownError } from "./saved-media";

export interface RenderSave {
  blob: Blob;
  name: string;
  /** True when a project copy keeps the assets (the local server). */
  copy: boolean;
  /** The page's transient key, for a hosted upload. */
  key: string;
  add?: AddAsset;
  upload?: typeof saveVideo;
}

export async function saveRender({
  blob,
  name,
  copy,
  key,
  add = addToProjectAssets,
  upload = saveVideo,
}: RenderSave): Promise<string> {
  if (!copy) {
    try {
      await upload(blob, name, key);
    } catch (error) {
      if (!(error instanceof UploadOutcomeUnknownError)) throw error;
      throw new Error(
        `${error.message} Show earlier saved videos before retrying; an interrupted upload may already be saved.`,
        { cause: error },
      );
    }
  }
  const added = await add({
    blob,
    filename: `${name}.mp4`,
    use: "production",
  });
  return copy
    ? `${addedMessage(added)} It is kept with the project on this computer.`
    : `Saved to your private library, which keeps it after a reload. ${addedMessage(added)} Project assets on the hosted site last until you reload; download the bundle to keep the project.`;
}
