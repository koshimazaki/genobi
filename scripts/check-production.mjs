/**
 * Ask production which build it is serving, and say so out loud.
 *
 * `Deploy production` skips when the `production` environment holds no
 * Cloudflare credentials, on purpose, so `main` stays green on a fork. The
 * catch is that a green run then looks exactly like a shipped one: after a
 * merged fix, production kept serving the previous build for a day, and the
 * first sign of it was a Comfy Cloud run failing in a node the fix had
 * already covered.
 *
 * The Worker stamps its commit into `/api/health`, so this script can answer
 * the only question that matters here — "is the thing I merged live?" — and
 * answer it as a warning when the deploy was skipped, and as a failure when
 * the deploy ran and production still serves something else (a cached bundle,
 * the wrong project, a rollback).
 */
import { execFileSync } from "node:child_process";

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

/** Either commit is the other's prefix, so a short and a long sha still match. */
const same = (served, expected) =>
  typeof served === "string" &&
  served.length > 0 &&
  (served.startsWith(expected) || expected.startsWith(served));

const say = (line) => {
  process.stdout.write(`${line}\n`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) process.stdout.write(`${line}\n`);
};

async function health() {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`health answered ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      // Cloudflare serves the previous deployment for a moment after a cut.
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw last;
}

const body = await health();
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
