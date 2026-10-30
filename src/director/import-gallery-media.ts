import { studioStore, type createStudioStore } from "../studio/store";
import { addServedMediaToProjectAssets } from "../studio/project-assets";

/**
 * Copy a gallery result (a still, a clip or a song) into the current project
 * without placing a clip, through the one path every output takes.
 */
export async function importGalleryMedia(
  url: string,
  filename: string,
  store: ReturnType<typeof createStudioStore> = studioStore,
  options: { keepTab?: boolean } = {},
) {
  return addServedMediaToProjectAssets(
    url,
    filename,
    "production",
    store,
    options,
  );
}
