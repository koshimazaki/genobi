import { build } from "esbuild";
import { cp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
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
