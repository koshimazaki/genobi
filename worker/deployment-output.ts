import { AppError } from "../server/errors";
import { inspectStoredAudio, MAX_AUDIO_BYTES } from "../shared/audio";
import type { ProviderResult } from "../shared/provider";
import type { Job } from "../shared/types";
import type { WorkflowClient } from "../shared/comfy/workflow";
import { putMedia } from "./media";
import { saveSource, type JobRow } from "./storage";

/** Private delivery URLs survive a lost copy response; no key is stored. */
export async function rememberDeploymentAudio(
  env: Env,
  job: string,
  files: NonNullable<ProviderResult["companions"]>,
) {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO deployment_outputs(job,data,expires) VALUES(?,?,?)",
  )
    .bind(job, JSON.stringify(files), Date.now() + 2 * 3600_000)
    .run();
}

/** Each companion uses the same private session ownership and retention as video. */
export async function copyDeploymentAudio(
  env: Env,
  row: JobRow,
  job: Job,
  client: WorkflowClient,
) {
  const record = await env.DB.prepare(
    "SELECT data FROM deployment_outputs WHERE job=?",
  )
    .bind(row.id)
    .first<{ data: string }>();
  const files = JSON.parse(record?.data ?? "[]") as NonNullable<
    ProviderResult["companions"]
  >;
  for (const file of files) {
    const id = `${job.id}-audio-${file.nodeId.replaceAll(":", "-")}`;
    const key = `${row.session}/${id}.audio`;
    const existing = await env.DB.prepare(
      "SELECT id FROM sources WHERE id=? AND session=?",
    )
      .bind(id, row.session)
      .first();
    if (!existing) {
      try {
        if (!(await env.MEDIA.head(key))) {
          const response = await client.download(file.url);
          await putMedia(
            env,
            key,
            response.body!,
            Number(response.headers.get("content-length")),
            MAX_AUDIO_BYTES,
            "application/octet-stream",
          );
        }
        const head = await env.MEDIA.head(key);
        if (!head)
          throw new AppError(502, "The companion audio could not be saved.");
        const metadata = await inspectStoredAudio(
          head.size,
          async (offset, length) => {
            const chunk = await env.MEDIA.get(key, {
              range: { offset, length },
            });
            if (!chunk)
              throw new AppError(502, "The companion audio could not be read.");
            return chunk.arrayBuffer();
          },
        );
        // Serve only the type established by the shared reader.
        const object = await env.MEDIA.get(key);
        if (!object)
          throw new AppError(502, "The companion audio could not be read.");
        await putMedia(
          env,
          key,
          object.body,
          head.size,
          MAX_AUDIO_BYTES,
          metadata.contentType,
        );
        await saveSource(
          env,
          {
            id,
            label: file.label,
            url: `/api/clips/${id}`,
            origin: "generated",
            mediaType: "audio",
            ...metadata,
          },
          row.session,
          key,
          head.size,
        );
      } catch (error) {
        await env.MEDIA.delete(key);
        throw error instanceof AppError
          ? error
          : new AppError(
              502,
              "The companion audio could not be inspected. Nothing was resubmitted.",
            );
      }
    }
    job.companions ??= [];
    if (!job.companions.some((c) => c.url === `/api/clips/${id}`))
      job.companions.push({ label: file.label, url: `/api/clips/${id}` });
  }
  await env.DB.prepare("DELETE FROM deployment_outputs WHERE job=?")
    .bind(row.id)
    .run();
}
