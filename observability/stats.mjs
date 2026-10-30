import { execFileSync } from "node:child_process";

/**
 * How many people, how many generations — and deliberately nothing else.
 *
 * Reads counts only. No prompt, camera term, session id, key, IP or country is
 * stored by the rollup or printed here, so running this cannot mine what
 * visitors made. `daily_stats` holds days the sweep has already frozen; the
 * live `jobs` rows cover everything still inside retention. Each day takes the
 * larger of the two, so the numbers are current even between sweeps.
 */
const DAY = "date(created_at/1000,'unixepoch')";
const LIVE = `SELECT ${DAY} AS day, COUNT(*) AS generations, COUNT(DISTINCT session) AS sessions,
  SUM(json_extract(data,'$.status')='Ready') AS ready,
  SUM(json_extract(data,'$.status') IN ('Error','expired','Request Moderated','Content Moderated')) AS failed,
  SUM(json_extract(data,'$.draft')=1) AS drafts,
  SUM(json_extract(data,'$.generator')='upscale') AS upscales,
  ROUND(SUM(COALESCE(json_extract(data,'$.costActualUsd'),json_extract(data,'$.costEstimateUsd'),0)),4) AS spend_usd
  FROM jobs GROUP BY day`;
const SQL = `SELECT day, MAX(generations) AS generations, MAX(sessions) AS sessions,
  MAX(ready) AS ready, MAX(failed) AS failed, MAX(drafts) AS drafts,
  MAX(upscales) AS upscales, MAX(spend_usd) AS spend_usd
  FROM (SELECT day,generations,sessions,ready,failed,drafts,upscales,spend_usd FROM daily_stats
        UNION ALL ${LIVE})
  GROUP BY day ORDER BY day`;

const remote = process.argv.includes("--local") ? "--local" : "--remote";
let output;
try {
  output = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "flux-studio-lite",
      remote,
      "--json",
      "--command",
      SQL,
    ],
    { encoding: "utf8", maxBuffer: 8_000_000 },
  );
} catch (error) {
  const detail = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
  console.error(
    detail.includes("no such table")
      ? "This database has no studio tables yet. Apply migrations/ first."
      : `Could not read the database.\n${detail || error.message}`,
  );
  process.exit(1);
}
const rows = JSON.parse(output.slice(output.indexOf("[")))[0].results;
if (!rows.length) {
  console.log("No generations recorded yet.");
  process.exit(0);
}
const columns = [
  ["generations", "gens"],
  ["sessions", "sessions"],
  ["ready", "ready"],
  ["failed", "failed"],
  ["drafts", "drafts"],
  ["upscales", "upscales"],
];
const cell = (value) => String(value).padStart(10);
const line = (label, value) =>
  label.padEnd(12) +
  columns.map(([key]) => cell(value(key))).join("") +
  cell(`$${Number(value("spend_usd")).toFixed(2)}`);
console.log(
  "day".padEnd(12) +
    columns.map(([, head]) => cell(head)).join("") +
    cell("spend"),
);
for (const row of rows) console.log(line(row.day, (key) => row[key] ?? 0));
const total = (key) =>
  rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
console.log("\n" + line("total", total));
// A visitor active on two days counts once per day: these are session-days, not people.
console.log(
  `\n${rows.length} day(s) recorded. "sessions" is distinct session cookies per day.`,
);
