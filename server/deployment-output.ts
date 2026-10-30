import type { WorkflowClient } from "../shared/comfy/workflow";
import { saveResult } from "./job-output";
import type { Store, StoredJob } from "./store";

/** Save the graph's IR/wet/audio files beside its video, with the same ownership. */
export async function saveDeploymentAudio(
  store: Store,
  job: StoredJob,
  client: WorkflowClient,
) {
  for (const output of job.companionDownloads ?? []) {
    // These are node ids from the bundled graph, never provider job identifiers.
    const id = `${job.id}-audio-${output.nodeId.replaceAll(":", "-")}`;
    const url = `/api/clips/${id}`;
    if (!store.data.sources.some((s) => s.id === id)) {
      const saved = await saveResult(
        store.directory,
        { id, generator: "audio" },
        await client.download(output.url),
      );
      store.data.sources.push({
        id,
        sessionId: job.sessionId,
        filePath: saved.file,
        url,
        label: output.label,
        origin: "generated",
        mediaType: "audio",
        ...saved.metadata,
      });
    }
    job.companions ??= [];
    if (!job.companions.some((file) => file.url === url))
      job.companions.push({ label: output.label, url });
    await store.save();
  }
  delete job.companionDownloads;
}
