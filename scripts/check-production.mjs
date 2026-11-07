/**
 * Ask production which build it is serving, and say so out loud.
 *
 * Production is deployed by hand (`npm run deploy:pages`), never by a merge,
 * so a green `main` says nothing about what is live. The Worker stamps its
 * commit into `/api/health`, and this script answers "is this commit live?"
 * two ways:
 *
 * - `REPORT_ONLY=true` (CI, after each push to main): one read, a notice when
 *   production serves another build, and never a failure.
 * - otherwise (the end of `npm run deploy:pages`): poll until production
 *   serves this commit, and fail when it still answers another build (a
 *   cached bundle, the wrong project, a rollback).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const url = (process.env.GENOBI_PRODUCTION_URL ?? "https://genobi.pages.dev")
  .trim()
  .replace(/\/+$/, "");
const reportOnly = process.env.REPORT_ONLY === "true";
const attempts = 6;

const commit = (() => {
  const sha = process.env.GITHUB_SHA?.trim();
  if (sha && /^[0-9a-f]{7,40}$/i.test(sha)) return sha.slice(0, 7);
  return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
    encoding: "utf8",
  }).trim();
})();

/** Only recognize commit-like SHAs, not arbitrary short prefixes. */
const same = (served, expected) =>
  typeof served === "string" &&
  /^[0-9a-f]{7,40}$/i.test(served) &&
  /^[0-9a-f]{7,40}$/i.test(expected) &&
  (served.toLowerCase().startsWith(expected.toLowerCase()) ||
    expected.toLowerCase().startsWith(served.toLowerCase()));

const say = (line) => {
  process.stdout.write(`${line}\n`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `${line}\n`);
};

async function health() {
  let last;
  // A report reads once. After a deploy, allow Pages to serve the prior build
  // briefly.
  const maxAttempts = reportOnly ? 1 : attempts;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`health answered ${response.status}`);
      const body = await response.json();
      if (reportOnly || same(body?.commit, commit) || attempt === maxAttempts)
        return body;
      // A 200 response containing the old commit is not yet a deployed fix.
      // Poll the build identity, not merely the route's HTTP status.
    } catch (error) {
      last = error;
    }
    if (attempt < maxAttempts)
      await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw last ?? new Error("Production health remained unavailable.");
}

let body;
try {
  body = await health();
} catch {
  say(
    `::${reportOnly ? "warning" : "error"} title=Production identity unavailable::${url}/api/health could not be read. ${reportOnly ? "Could not tell which build is live." : "The deployment ran, but the served build could not be verified."}`,
  );
  process.exit(reportOnly ? 0 : 1);
}
const served = typeof body?.commit === "string" ? body.commit : undefined;

if (same(served, commit)) {
  say(`Production ${url} serves this commit (${commit}).`);
  process.exit(0);
}

const state =
  served === undefined
    ? "an unversioned build"
    : served === "dev"
      ? "a build with no commit stamp"
      : `${served}`;

if (reportOnly) {
  say(
    `::notice title=Production serves another build::${url} serves ${state}, this commit is ${commit}. Merges do not deploy: run npm run deploy:pages from a clean checkout of main to make it live.`,
  );
  process.exit(0);
}

say(
  `::error title=Production serves another build::${url} answers ${state} after a deploy of ${commit}. Check the Pages project, its cache and the deployment log; do not assume this push is live.`,
);
process.exit(1);
