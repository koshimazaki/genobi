import { sweepDeployments } from "./deployment-retention";
import {
  expireStaleJob,
  JOB_MAX_AGE_MS,
  RETENTION_MS,
  SWEEP_BATCH,
  SWEEP_INTERVAL_MS,
} from "../shared/lifecycle";
import { rollUpDailyStats } from "../observability/rollup";
import { evictOverTotal } from "./storage";
import { RATE_WINDOW_MS } from "../shared/limits";
import { terminalStatuses, type Job } from "../shared/types";
import { sweepRunnerRelay } from "./runner-store";

/** The one rate_limits row that is a schedule rather than a request counter. */
const CLAIM_ID = "sweep";

export interface SweepReport {
  /** Abandoned jobs aged out to `expired`. */
  expired: number;
  /** Source records, and their R2 objects, past retention. */
  sources: number;
  /** Stored objects no source record owns, collected with the job that named them. */
  orphans: number;
  /** Job records past retention. */
  jobs: number;
  /** Capability links that had already expired. */
  shares: number;
  /** Rate-limit windows that had already closed. */
  windows: number;
  /** Quotes past their expiry, spent or not. */
  quotes: number;
  /** Chains past retention, which their stage jobs share. */
  chains: number;
  /** Day rows whose aggregate was refreshed before any detail was deleted. */
  days: number;
  /** Clips dropped to bring the deployment back inside its storage ceiling. */
  evicted: number;
}

/**
 * Housekeeping for everything no request will come back for.
 *
 * Two callers reach it: the Workers deployment's cron trigger, and — because
 * Cloudflare Pages has no cron trigger — the request path, in the background.
 * Both go through `claim`, so only the first caller after SWEEP_INTERVAL_MS
 * does the work and the rest return immediately. Every step is capped at
 * SWEEP_BATCH rows, so no single invocation pays for a long backlog.
 */
export async function sweep(
  env: Env,
  now = Date.now(),
): Promise<SweepReport | null> {
  if (!(await claim(env, now))) return null;
  await sweepRunnerRelay(env.DB, now);
  await sweepDeployments(env, now);
  return {
    expired: await expireAbandonedJobs(env, now),
    days: await rollUpDailyStats(env),
    sources: await deleteExpiredMedia(env, now),
    orphans: await collectOrphanedMedia(env, now),
    ...(await deleteExpiredRows(env, now)),
    // Last, so retention has already reclaimed everything it was going to.
    evicted: await evictOverTotal(env),
  };
}

/** A conditional write is the whole mutex: at most one winner per interval. */
async function claim(env: Env, now: number) {
  const claimed = await env.DB.prepare(
    `INSERT INTO rate_limits (id,starts,count) VALUES (?,?,0)
    ON CONFLICT(id) DO UPDATE SET starts=excluded.starts WHERE starts<? RETURNING starts`,
  )
    .bind(CLAIM_ID, now, now - SWEEP_INTERVAL_MS)
    .first<{ starts: number }>();
  return Boolean(claimed);
}

/**
 * Only a browser holding the visitor's key can advance a job, and the sweep has
 * no key, so it cannot finish one. It closes the record instead: a job nobody
 * came back for becomes `expired` rather than polling or retrying forever.
 */
async function expireAbandonedJobs(env: Env, now: number) {
  const unfinished = terminalStatuses.map(() => "?").join(",");
  const stale = await env.DB.prepare(
    `SELECT id, session, data, created_at FROM jobs
    WHERE created_at < ? AND json_extract(data,'$.status') NOT IN (${unfinished})
    LIMIT ?`,
  )
    .bind(now - JOB_MAX_AGE_MS, ...terminalStatuses, SWEEP_BATCH)
    .all<{ id: string; session: string; data: string; created_at: number }>();
  const updates = [];
  for (const row of stale.results) {
    const job = JSON.parse(row.data) as Job;
    if (!expireStaleJob(job, row.created_at, now)) continue;
    job.updatedAt = new Date(now).toISOString();
    updates.push(
      // Clearing both links keeps a closed job from ever reaching BFL again.
      env.DB.prepare(
        `UPDATE jobs SET data=?, polling_url=NULL, remote_url=NULL WHERE id=? AND session=?
         AND json_extract(data,'$.status') NOT IN (${unfinished})`,
      ).bind(JSON.stringify(job), row.id, row.session, ...terminalStatuses),
    );
  }
  if (updates.length) await env.DB.batch(updates);
  return updates.length;
}

/** R2 objects go first: a source row is the only record of the key that owns one. */
async function deleteExpiredMedia(env: Env, now: number) {
  const expired = await env.DB.prepare(
    "SELECT id, object_key FROM sources WHERE created_at > 0 AND created_at < ? LIMIT ?",
  )
    .bind(now - RETENTION_MS, SWEEP_BATCH)
    .all<{ id: string; object_key: string }>();
  if (!expired.results.length) return 0;
  await env.MEDIA.delete(expired.results.map((row) => row.object_key));
  await env.DB.prepare(
    `DELETE FROM sources WHERE id IN (${expired.results.map(() => "?").join(",")})`,
  )
    .bind(...expired.results.map((row) => row.id))
    .run();
  return expired.results.length;
}

/**
 * A copy interrupted between `MEDIA.put` and its source record leaves an object
 * nothing points at. Its key is derived from the job, so retiring that job is
 * the last moment the key can still be reconstructed. Rows that do own a source
 * are skipped: `deleteExpiredMedia` above is what removes those.
 *
 * Both this and the job deletion below walk oldest first, so a backlog larger
 * than one batch can never delete a job before this pass has seen it.
 */
async function collectOrphanedMedia(env: Env, now: number) {
  const orphans = await env.DB.prepare(
    `SELECT id, session FROM jobs
    WHERE created_at < ? AND id NOT IN (SELECT id FROM sources)
    ORDER BY created_at LIMIT ?`,
  )
    .bind(now - RETENTION_MS, SWEEP_BATCH)
    .all<{ id: string; session: string }>();
  if (!orphans.results.length) return 0;
  await env.MEDIA.delete(
    orphans.results.flatMap((row) => [
      `${row.session}/${row.id}.mp4`,
      `${row.session}/${row.id}.image`,
    ]),
  );
  return orphans.results.length;
}

/**
 * Retention matches the session cookie's 30 days: once a visitor's cookie is
 * gone the rows are unreachable anyway. Closed capability links and rate-limit
 * windows are already dead and go as soon as they are found.
 */
async function deleteExpiredRows(env: Env, now: number) {
  const [jobs, shares, windows, quotes, chains] = await env.DB.batch([
    // D1 has no DELETE ... LIMIT, so the batch bound is a subselect.
    env.DB.prepare(
      `DELETE FROM jobs WHERE id IN
      (SELECT id FROM jobs WHERE created_at < ? ORDER BY created_at LIMIT ?)`,
    ).bind(now - RETENTION_MS, SWEEP_BATCH),
    env.DB.prepare("DELETE FROM shares WHERE expires < ?").bind(now),
    env.DB.prepare("DELETE FROM rate_limits WHERE starts < ? AND id <> ?").bind(
      now - RATE_WINDOW_MS,
      CLAIM_ID,
    ),
    // Expired quotes can never be spent; a run they paid for has its own row.
    env.DB.prepare("DELETE FROM quotes WHERE expires < ?").bind(now),
    // A chain is created before its stage jobs, so it never outlives them.
    env.DB.prepare(
      `DELETE FROM chains WHERE id IN
      (SELECT id FROM chains WHERE created_at < ? ORDER BY created_at LIMIT ?)`,
    ).bind(now - RETENTION_MS, SWEEP_BATCH),
  ]);
  return {
    jobs: jobs.meta.changes ?? 0,
    shares: shares.meta.changes ?? 0,
    windows: windows.meta.changes ?? 0,
    quotes: quotes.meta.changes ?? 0,
    chains: chains.meta.changes ?? 0,
  };
}
