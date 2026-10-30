import { withBrowserActivity } from "../activity/store";
/**
 * Render a playblast, then hand it to the Director, unless it was cancelled.
 * The signal is checked between the two steps and passed into the import,
 * which checks it again just before committing, so a cancel that lands
 * after the last frame or during the import adds nothing.
 */
import { addPlayblastToDirector } from "./add-to-director";
import { renderPlayblast, type PlayblastJob } from "./playblast";

export interface SaveSteps {
  render: (job: PlayblastJob) => Promise<Blob>;
  save: (
    file: File,
    layerName: string,
    signal: AbortSignal,
  ) => Promise<unknown>;
}

const defaults: SaveSteps = {
  render: renderPlayblast,
  save: addPlayblastToDirector,
};

async function renderAndSaveImpl(
  job: PlayblastJob,
  fileName: string,
  layerName: string,
  steps: SaveSteps = defaults,
): Promise<Blob> {
  const blob = await steps.render(job);
  job.signal.throwIfAborted();
  await steps.save(
    new File([blob], fileName, { type: "video/mp4" }),
    layerName,
    job.signal,
  );
  return blob;
}

export const renderAndSave = (...args: Parameters<typeof renderAndSaveImpl>) =>
  withBrowserActivity("scene", () => renderAndSaveImpl(...args));
