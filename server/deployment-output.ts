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
    let source = store.data.sources.find(
      (s) => s.id === id && s.sessionId === job.sessionId,
    );
    if (!source) {
      const saved = await saveResult(
        store.directory,
        { id, generator: "audio" },
        await client.download(output.url),
      );
      source = {
        id,
        sessionId: job.sessionId,
        filePath: saved.file,
        url,
        label: output.label,
        origin: "generated",
        mediaType: "audio",
        ...saved.metadata,
      };
      store.data.sources.push(source);
    }
    job.companions ??= [];
    const companion = {
      assetId: id,
      mediaType: "audio" as const,
      contentType: source.contentType ?? "application/octet-stream",
      label: output.label,
      url,
    };
    const prior = job.companions.findIndex((file) => file.url === url);
    if (prior < 0) job.companions.push(companion);
    else job.companions[prior] = companion;
    await store.save();
  }
  delete job.companionDownloads;
}
