import { RETENTION_MS, SWEEP_BATCH } from "../shared/lifecycle";
import type { ProviderResult } from "../shared/provider";

/** Reclaim interrupted companion copies before discarding their delivery receipts. */
export async function sweepDeployments(env: Env, now: number) {
  const expired = await env.DB.prepare(
    `SELECT d.job,d.data,j.session FROM deployment_outputs d
    LEFT JOIN jobs j ON j.id=d.job WHERE d.expires<? LIMIT ?`,
  )
    .bind(now, SWEEP_BATCH)
    .all<{ job: string; data: string; session: string | null }>();
  for (const row of expired.results) {
    if (row.session) {
      const files = JSON.parse(row.data) as NonNullable<
        ProviderResult["companions"]
      >;
      for (const file of files) {
        const id = `${row.job}-audio-${file.nodeId.replaceAll(":", "-")}`;
        const kept = await env.DB.prepare(
          "SELECT id FROM sources WHERE id=? AND session=?",
        )
          .bind(id, row.session)
          .first();
        if (!kept) await env.MEDIA.delete(`${row.session}/${id}.audio`);
      }
    }
    await env.DB.prepare("DELETE FROM deployment_outputs WHERE job=?")
      .bind(row.job)
      .run();
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM deployment_assets WHERE expires<?").bind(now),
    env.DB.prepare("DELETE FROM deployment_settings WHERE updated_at<?").bind(
      now - RETENTION_MS,
    ),
  ]);
}
