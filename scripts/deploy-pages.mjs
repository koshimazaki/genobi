import { execFileSync } from "node:child_process";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!accountId) {
  throw new Error(
    "Set CLOUDFLARE_ACCOUNT_ID before deploying FLUX Studio to Pages.",
  );
}
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
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
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    },
  },
);
