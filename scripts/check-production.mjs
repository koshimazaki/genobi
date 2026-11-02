/**
 * Ask production which build it is serving, and say so out loud.
 *
 * `Deploy production` skips when the `production` environment holds no
 * Cloudflare credentials, on purpose, so `main` stays green on a fork. The
 * catch is that a green run then looks exactly like a shipped one:
 * a merged fix can remain absent from production. A locally run dev server
 * uses its own checkout and configuration, independently of Cloudflare.
 *
 * The Worker stamps its commit into `/api/health`, so this script can answer
 * the only question that matters here — "is the thing I merged live?" — and
 * answer it as a warning when the deploy was skipped, and as a failure when
 * the deploy ran and production still serves something else (a cached bundle,
 * the wrong project, a rollback).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const url = (process.env.GENOBI_PRODUCTION_URL ?? "https://genobi.pages.dev")
  .trim()
  .replace(/\/+$/, "");
const skipped = process.env.DEPLOY_SKIPPED === "true";
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
  // An absent credential means no deployment ran: inspect once and report it.
  // After a real deploy, allow Pages to serve the prior build briefly.
  const maxAttempts = skipped ? 1 : attempts;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`health answered ${response.status}`);
      const body = await response.json();
      if (skipped || same(body?.commit, commit) || attempt === maxAttempts)
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
    `::${skipped ? "warning" : "error"} title=Production identity unavailable::${url}/api/health could not be read. ${skipped ? "The deployment was skipped because the production credentials were missing; no code from this push was deployed." : "The deployment ran, but the served build could not be verified."}`,
  );
  process.exit(skipped ? 0 : 1);
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

if (skipped) {
  say(
    `::warning title=Production was not deployed::${url} serves ${state}, this commit is ${commit}. The deploy job skipped for want of CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the production environment, so nothing merged in this push is live.`,
  );
  process.exit(0);
}

say(
  `::error title=Production serves another build::${url} answers ${state} after a deploy of ${commit}. Check the Pages project, its cache and the deployment log; do not assume this push is live.`,
);
process.exit(1);
