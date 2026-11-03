import { studioStore, type createStudioStore } from "../studio/store";
import type { Job } from "../../shared/types";
import { addServedMediaToProjectAssets } from "../studio/project-assets";
import { cameraGeneration } from "../studio/project-generation";

/**
 * Copy a gallery result (a still, a clip or a song) into the current project
 * without placing a clip, through the one path every output takes. A Camera
 * job's result keeps its recipe (`project-generation.ts`), so the project's
 * Recreate restores it.
 */
export async function importGalleryMedia(
  url: string,
  filename: string,
  store: ReturnType<typeof createStudioStore> = studioStore,
  options: { keepTab?: boolean; job?: Job } = {},
) {
  const { job, ...rest } = options;
  return addServedMediaToProjectAssets(url, filename, "production", store, {
    ...rest,
    ...(job ? { generation: await cameraGeneration(job) } : {}),
  });
}
