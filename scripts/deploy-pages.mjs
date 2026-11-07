/**
 * The one way production is deployed: by hand, from a clean checkout of
 * `main`, after `npm run build:pages` (`npm run deploy:pages` runs both).
 * Merges never deploy, so nothing spends Cloudflare's free quota until
 * someone runs this (docs/cloudflare.md#deployment).
 *
 * 1. Refuses a dirty checkout: the bundle must be the commit it is stamped with.
 * 2. Asks production which commit it serves (`/api/health`) and refuses when
 *    `migrations/` changed since then, until they are applied and the deploy
 *    is rerun with `--migrations-applied`. Nothing here touches D1 itself.
 * 3. Uploads `.pages/` to the `genobi` Pages project with this commit.
 * 4. Polls `/api/health` until production serves this commit
 *    (`scripts/check-production.mjs`), and fails if it does not.
 */
import { execFileSync } from "node:child_process";

const PRODUCTION = (
  process.env.GENOBI_PRODUCTION_URL ?? "https://genobi.pages.dev"
).replace(/\/+$/, "");
const MIGRATE =
  "npx wrangler d1 migrations apply flux-studio-lite --remote --config wrangler.pages.json";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const stop = (message) => {
  console.error(message);
  process.exit(1);
};

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!accountId)
  stop(
    "Set CLOUDFLARE_ACCOUNT_ID before deploying Genobi to Pages (npx wrangler whoami prints it).",
  );
if (git("status", "--porcelain", "--untracked-files=no"))
  stop(
    "Commit or stash local changes first: the deployed bundle must be exactly this commit.",
  );
const head = git("rev-parse", "HEAD");

/** The commit production serves, or undefined when it cannot be read. */
async function liveCommit() {
  try {
    const response = await fetch(`${PRODUCTION}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json();
    return typeof body?.commit === "string" ? body.commit : undefined;
  } catch {
    return undefined;
  }
}

const isCommit = (sha) => {
  try {
    git("cat-file", "-e", `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
};

const live = await liveCommit();
if (!live || !/^[0-9a-f]{7,40}$/i.test(live) || !isCommit(live))
  console.warn(
    `Production answers ${live ?? "nothing"}, which this checkout does not know, so pending migrations cannot be checked. If migrations/ changed since the live build, run: ${MIGRATE}`,
  );
else {
  const pending = git("diff", "--name-only", live, head, "--", "migrations");
  if (pending && !process.argv.includes("--migrations-applied"))
    stop(
      `Production serves ${live.slice(0, 7)}; these migrations were added since:\n${pending}\n\nApply them first (additive, so the live build keeps working):\n  ${MIGRATE}\nthen deploy again with: npm run deploy:pages -- --migrations-applied`,
    );
  console.log(
    `Production serves ${live.slice(0, 7)}; deploying ${head.slice(0, 7)}${pending ? " (migrations applied)" : ", no migrations pending"}.`,
  );
}

execFileSync(
  "npx",
  [
    "wrangler",
    "pages",
    "deploy",
    "../.pages",
    "--project-name",
    "genobi",
    "--branch",
    "main",
    "--commit-hash",
    head,
  ],
  {
    cwd: ".pages-project",
    stdio: "inherit",
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId },
  },
);

// Pages may serve the previous build for a few seconds; the check polls.
const { GITHUB_SHA: _sha, REPORT_ONLY: _report, ...env } = process.env;
execFileSync("node", ["scripts/check-production.mjs"], {
  stdio: "inherit",
  env: { ...env, GENOBI_PRODUCTION_URL: PRODUCTION },
});
