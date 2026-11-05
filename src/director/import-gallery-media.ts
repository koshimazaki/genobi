import { studioStore, type createStudioStore } from "../studio/store";
import type { Job } from "../../shared/types";
import { addServedMediaToProjectAssets } from "../studio/project-assets";
import { cameraGeneration } from "../studio/project-generation";

/**
 * Copy a gallery result (a still, a clip or a song) into the current project
 * without placing a clip, through the one path every output takes. A Camera
 * job's result keeps its recipe (`project-generation.ts`), so the project's
 * Recreate restores it. The project is the one open when the person sent it:
 * when another opens while the job's record loads, nothing is imported.
 */
export async function importGalleryMedia(
  url: string,
  filename: string,
  store: ReturnType<typeof createStudioStore> = studioStore,
  options: { keepTab?: boolean; job?: Job } = {},
) {
  const { job, ...rest } = options;
  const project = () => store.getState().director.bundle?.project.id;
  const sentTo = project();
  if (!sentTo) throw new Error("Open a project first.");
  const generation = job ? await cameraGeneration(job) : undefined;
  if (project() !== sentTo)
    throw new Error("Project changed. Add the result again.");
  return addServedMediaToProjectAssets(url, filename, "production", store, {
    ...rest,
    ...(generation ? { generation } : {}),
  });
}
