import type { Job, Source } from "../shared/types";
import catalogue from "../public/media/gallery.json";
import { AppError } from "../server/errors";
import { parseLibrary } from "../shared/library";
import {
  applyPersistedMediaState,
  MEDIA_UNAVAILABLE_MESSAGE,
  SAVE_JOB_SQL,
} from "../shared/job-storage";
import {
  SESSION_STORAGE_BYTES,
  SWEEP_BATCH,
  TOTAL_STORAGE_BYTES,
} from "../shared/lifecycle";
import { inspectMp4, checkUpscaleLimits } from "../shared/mp4";
import {
  RATE_LIMITS,
  RATE_LIMIT_MESSAGE,
  RATE_WINDOW_MS,
  type RateBucket,
} from "../shared/limits";

export interface JobRow {
  id: string;
  session: string;
  input: string;
  data: string;
  polling_url: string | null;
  remote_url: string | null;
  lease_until: number;
  /** JSON `TakeStart`; null on runs from before takes. */
  take: string | null;
  created_at: number;
}
export interface SourceRow {
  id: string;
  session: string;
  data: string;
  object_key: string;
  bytes: number;
  /** SHA-256 of an upload's bytes; null for generated media and older rows. */
  sha256: string | null;
}
/** Bundled clips, validated once at module load. See shared/library.ts. */
export const library: Source[] = parseLibrary(catalogue);

/**
 * A library clip is a public bundled asset; a session clip is a private R2
 * object reachable only with the owning cookie. Callers branch on `kind`
 * instead of inferring storage from the id.
 */
export type ResolvedSource =
  | { kind: "library"; source: Source }
  | { kind: "session"; source: Source; key: string; sha256?: string };

export async function ownedJob(env: Env, id: string, session: string) {
  const row = await env.DB.prepare(
    "SELECT * FROM jobs WHERE id=? AND session=?",
  )
    .bind(id, session)
    .first<JobRow>();
  if (!row) throw new AppError(404, "Job not found.");
  return row;
}
export async function saveJob(env: Env, row: JobRow, job: Job) {
  job.updatedAt = new Date().toISOString();
  const incoming = JSON.stringify(job);
  const saved = await env.DB.prepare(SAVE_JOB_SQL)
    .bind(
      incoming,
      MEDIA_UNAVAILABLE_MESSAGE,
      incoming,
      row.polling_url,
      row.remote_url,
      row.id,
      row.session,
    )
    .first<{ data: string }>();
  if (saved) {
    const persisted = JSON.parse(saved.data) as Job;
    applyPersistedMediaState(job, persisted);
  }
}
export async function sessionSource(
  env: Env,
  id: string,
  session: string,
  missing = "Video not found.",
) {
  const row = await env.DB.prepare(
    "SELECT * FROM sources WHERE id=? AND session=?",
  )
    .bind(id, session)
    .first<SourceRow>();
  if (!row) throw new AppError(404, missing);
  return {
    source: JSON.parse(row.data) as Source,
    key: row.object_key,
    ...(row.sha256 ? { sha256: row.sha256 } : {}),
  };
}
export async function resolveSource(
  env: Env,
  id: string,
  session: string,
): Promise<ResolvedSource> {
  const clip = library.find((item) => item.id === id);
  if (clip) return { kind: "library", source: clip };
  return {
    kind: "session",
    ...(await sessionSource(
      env,
      id,
      session,
      "Choose a video from this session or the library.",
    )),
  };
}
export async function inspectObject(env: Env, key: string, upscale = false) {
  const head = await env.MEDIA.head(key);
  if (!head) throw new AppError(404, "Video not found.");
  try {
    const metadata = await inspectMp4(head.size, async (offset, length) => {
      const chunk = await env.MEDIA.get(key, { range: { offset, length } });
      if (!chunk) throw new Error("Missing video");
      return chunk.arrayBuffer();
    });
    return {
      metadata: upscale ? checkUpscaleLimits(metadata, head.size) : metadata,
      bytes: head.size,
    };
  } catch (error) {
    throw new AppError(
      400,
      error instanceof Error ? error.message : "Cannot read this MP4.",
    );
  }
}
/** The only way stored media grows, so the ceiling is enforced here. */
export async function saveSource(
  env: Env,
  source: Source,
  session: string,
  key: string,
  bytes: number,
  sha256: string | null = null,
) {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO sources (id,session,data,object_key,bytes,created_at,sha256) VALUES (?,?,?,?,?,?,?)",
  )
    .bind(
      source.id,
      session,
      JSON.stringify(source),
      key,
      bytes,
      Date.now(),
      sha256,
    )
    .run();
  await evict(env, SESSION_STORAGE_BYTES, session);
}

/** Brings the whole deployment back inside its ceiling; called by the sweep. */
export const evictOverTotal = (env: Env) => evict(env, TOTAL_STORAGE_BYTES);

/**
 * Drops the oldest stored clips until the total is inside `limit`.
 *
 * Generated job rows stay until normal retention so their idempotency key and
 * generation outcome remain durable. Their public data is marked unavailable
 * when the media goes; uploads have no job row and simply disappear.
 *
 * Eviction rather than refusal, because a visitor demonstrating the studio
 * should never meet a wall mid-run, and the gallery already tells them to
 * download anything they want to keep. The newest clip is never evicted, so a
 * single oversized result still arrives.
 */
async function evict(env: Env, limit: number, session?: string) {
  const scope = session ? "WHERE session=?" : "";
  const bind = session ? [session] : [];
  const total = await env.DB.prepare(
    `SELECT COALESCE(SUM(bytes),0) AS bytes FROM sources ${scope}`,
  )
    .bind(...bind)
    .first<{ bytes: number }>();
  if (!total || total.bytes <= limit) return 0;
  const rows = await env.DB.prepare(
    `SELECT id, object_key, bytes FROM sources ${scope} ORDER BY created_at LIMIT ?`,
  )
    .bind(...bind, SWEEP_BATCH)
    .all<{ id: string; object_key: string; bytes: number }>();
  let over = total.bytes - limit;
  const dropped: typeof rows.results = [];
  for (const row of rows.results) {
    if (over <= 0 || dropped.length >= rows.results.length - 1) break;
    dropped.push(row);
    over -= row.bytes;
  }
  if (!dropped.length) return 0;
  const ids = dropped.map((row) => row.id);
  const holes = ids.map(() => "?").join(",");
  await env.MEDIA.delete(dropped.map((row) => row.object_key));
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM sources WHERE id IN (${holes})`).bind(...ids),
    env.DB.prepare(
      `UPDATE jobs SET data=json_set(
          json_remove(data,'$.resultUrl'),
          '$.mediaAvailable',json('false'),
          '$.error',?
        ) WHERE id IN (${holes})`,
    ).bind(MEDIA_UNAVAILABLE_MESSAGE, ...ids),
  ]);
  return dropped.length;
}
export async function history(env: Env, session: string) {
  const jobs = await env.DB.prepare(
    "SELECT data FROM jobs WHERE session=? ORDER BY created_at DESC LIMIT 50",
  )
    .bind(session)
    .all<{ data: string }>();
  const sources = await env.DB.prepare(
    "SELECT data FROM sources WHERE session=? LIMIT 200",
  )
    .bind(session)
    .all<{ data: string }>();
  return {
    jobs: jobs.results.map((r) => JSON.parse(r.data)),
    sources: [...library, ...sources.results.map((r) => JSON.parse(r.data))],
  };
}
/** One fixed window per id, counted in D1 so every isolate shares the ceiling. */
export async function rateLimit(env: Env, bucket: RateBucket, id: string) {
  const now = Date.now();
  const result = await env.DB.prepare(
    `INSERT INTO rate_limits (id,starts,count) VALUES (?,?,1)
    ON CONFLICT(id) DO UPDATE SET count=CASE WHEN starts<? THEN 1 ELSE count+1 END,
    starts=CASE WHEN starts<? THEN excluded.starts ELSE starts END RETURNING count`,
  )
    .bind(`${bucket}:${id}`, now, now - RATE_WINDOW_MS, now - RATE_WINDOW_MS)
    .first<{ count: number }>();
  if (!result || result.count > RATE_LIMITS[bucket])
    throw new AppError(429, RATE_LIMIT_MESSAGE);
}
