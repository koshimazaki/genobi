import { build } from "esbuild";
import { cp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

/**
 * The commit this bundle is built from, stamped into the Worker so
 * `/api/health` can name the build it serves. `GITHUB_SHA` is the checked-out
 * commit in CI; a manual build falls back to the checkout's own HEAD.
 */
const commit = (() => {
  const sha = process.env.GITHUB_SHA?.trim();
  if (sha && /^[0-9a-f]{7,40}$/i.test(sha)) return sha.slice(0, 7);
  return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
    encoding: "utf8",
  }).trim();
})();

// Keep Pages' advanced-mode worker separate from the existing Workers build.
await rm(".pages", { recursive: true, force: true });
await mkdir(".pages", { recursive: true });
await cp("dist", ".pages", { recursive: true });
await build({
  entryPoints: ["worker/index.ts"],
  outfile: ".pages/_worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  // `shared/build-info.ts` reads this; nothing else may vary per build.
  define: { __GENOBI_COMMIT__: JSON.stringify(commit) },
  // @comfyorg/sdk imports node: modules; Pages resolves them under nodejs_compat.
  external: ["node:*"],
});
await writeFile(
  ".pages/_routes.json",
  JSON.stringify({
    version: 1,
    include: ["/api/*", "/watch/*", "/embed/*"],
    exclude: [],
  }),
);

// Pages only accepts the standard config filename. Use an isolated deployment cwd.
const config = JSON.parse(await readFile("wrangler.pages.json", "utf8"));
config.$schema = "../node_modules/wrangler/config-schema.json";
config.pages_build_output_dir = "../.pages";
for (const database of config.d1_databases)
  database.migrations_dir = "../migrations";
await mkdir(".pages-project", { recursive: true });
await writeFile(
  ".pages-project/wrangler.jsonc",
  JSON.stringify(config, null, 2),
);
