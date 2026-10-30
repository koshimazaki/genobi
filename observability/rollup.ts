/**
 * The only thing this deployment records about its own use: how many sessions
 * and how many generations, per UTC day.
 *
 * It runs inside the lifecycle sweep, before any row is deleted, so the 30-day
 * retention costs the detail and not the counts. Counters only move upward: a
 * day whose detail has already gone no longer appears in the GROUP BY, so its
 * frozen row is untouched, and a day deleted only in part cannot lower its own
 * totals.
 *
 * It stores counts and nothing else — no prompt, camera term, session id, key,
 * IP or country. See ./README.md for what is measured and what is not.
 */
export async function rollUpDailyStats(env: Env) {
  const rolled = await env.DB.prepare(
    `INSERT INTO daily_stats (day,generations,sessions,ready,failed,drafts,upscales,spend_usd)
    SELECT date(created_at/1000,'unixepoch') AS day,
      COUNT(*),
      COUNT(DISTINCT session),
      SUM(json_extract(data,'$.status')='Ready'),
      SUM(json_extract(data,'$.status') IN ('Error','expired','Request Moderated','Content Moderated')),
      SUM(json_extract(data,'$.draft')=1),
      SUM(json_extract(data,'$.generator')='upscale'),
      ROUND(SUM(COALESCE(json_extract(data,'$.costActualUsd'),json_extract(data,'$.costEstimateUsd'),0)),4)
    FROM jobs GROUP BY day
    ON CONFLICT(day) DO UPDATE SET
      generations=MAX(daily_stats.generations,excluded.generations),
      sessions=MAX(daily_stats.sessions,excluded.sessions),
      ready=MAX(daily_stats.ready,excluded.ready),
      failed=MAX(daily_stats.failed,excluded.failed),
      drafts=MAX(daily_stats.drafts,excluded.drafts),
      upscales=MAX(daily_stats.upscales,excluded.upscales),
      spend_usd=MAX(daily_stats.spend_usd,excluded.spend_usd)`,
  ).run();
  return rolled.meta.changes ?? 0;
}
