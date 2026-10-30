import { isTerminal, type Job } from "./types";

/**
 * Nothing in the studio may stay unfinished forever.
 *
 * Only a browser holding the visitor's key can advance a job, so a closed tab
 * would otherwise leave a paid row non-terminal for good, and a result whose
 * metadata cannot be read would be retried on every future poll. Both end here.
 */
export const JOB_MAX_AGE_MS = 30 * 60_000;

/** Records live exactly as long as the session cookie that owns them. */
export const RETENTION_MS = 30 * 86_400_000;

/** At most one sweep per interval, whichever caller triggers it. */
export const SWEEP_INTERVAL_MS = 5 * 60_000;

/**
 * Stored media a single visitor, and the whole deployment, may hold at once.
 *
 * Generation is paid for with the visitor's own key, so filling these costs
 * them real money rather than the studio: at roughly 6 MB and $1.70 per ten
 * second clip, a session ceiling is about forty clips and the deployment
 * ceiling about $800 of someone else's credits. They exist to make the number
 * statable, not to fend off an attacker.
 *
 * They also keep the `sources` table small enough that evicting oldest-first
 * needs no extra index.
 */
export const SESSION_STORAGE_BYTES = 250_000_000;
/**
 * The largest result the studio will copy. It must stay at or below
 * SESSION_STORAGE_BYTES: a single generation may never exceed a visitor's whole
 * ceiling, or eviction could take the clip that just arrived. A test pins that
 * relationship so lowering one constant cannot quietly break the other.
 */
export const MAX_RESULT_BYTES = 250_000_000;
export const TOTAL_STORAGE_BYTES = 3_000_000_000;

/** Rows touched per sweep, so one request never pays for a long backlog. */
export const SWEEP_BATCH = 100;

export const STALE_JOB_MESSAGE = `This generation ran past the studio's ${JOB_MAX_AGE_MS / 60_000}-minute window. Check your BFL usage before starting another.`;

/**
 * Ages an abandoned job out to `expired`. Returns true when the job changed, so
 * callers only write the rows they actually touched.
 *
 * `expired` rather than `Error`: the studio stopped watching, which is not the
 * same as BFL failing, and an uncertain paid request is never retried for the
 * visitor automatically.
 */
export function expireStaleJob(job: Job, createdAt: number, now = Date.now()) {
  if (isTerminal(job.status) || !(now - createdAt > JOB_MAX_AGE_MS))
    return false;
  job.status = "expired";
  job.error = STALE_JOB_MESSAGE;
  return true;
}
