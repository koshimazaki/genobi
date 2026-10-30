import { build } from "esbuild";
import { mkdir, writeFile, cp, readFile } from "node:fs/promises";
import path from "node:path";

// Vite's `?raw` imports (Director effect sources) become text modules here too.
const raw = {
  name: "raw",
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.slice(0, -4)),
      namespace: "raw",
    }));
    b.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({
      contents: await readFile(args.path, "utf8"),
      loader: "text",
    }));
  },
};
// Vite serves root-relative CSS assets from public/. Resolve them as files
// here so esbuild includes them and rewrites their URLs for the Comfy bundle.
const publicAssets = {
  name: "public-css-assets",
  setup(b) {
    b.onResolve({ filter: /^\// }, (args) => {
      if (args.kind === "url-token")
        return { path: path.resolve("public", args.path.slice(1)) };
    });
  },
};
// `--out <dir>` builds elsewhere (`npm run check:scene-adapter` builds twice
// into scratch directories); the default is the local Comfy node's web folder.
const at = process.argv.indexOf("--out");
const out =
  at > 0 && process.argv[at + 1]
    ? process.argv[at + 1]
    : "custom_nodes/director_world_builder/web";
await mkdir(out, { recursive: true });
await build({
  stdin: {
    contents:
      'import "@fontsource-variable/instrument-sans";import "@fontsource/ibm-plex-mono/400.css";import React from "react";import {createRoot} from "react-dom/client";import WorldBuilder from "./src/world-builder/WorldBuilder";createRoot(document.getElementById("root")).render(React.createElement(WorldBuilder));',
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  plugins: [raw, publicAssets],
  loader: { ".woff": "file", ".woff2": "file" },
  assetNames: "fonts/[name]-[hash]",
  format: "esm",
  target: "es2022",
  outfile: `${out}/adapter.mjs`,
  minify: true,
  // Vite-only `import.meta.glob` (Director's example bundle) has no files here.
  define: {
    "process.env.NODE_ENV": '"production"',
    // `host.ts`: this bundle is the Comfy node's World Builder.
    "globalThis.__genobiWorldHost": '"comfy"',
    "import.meta.glob": "__noViteGlob",
  },
  banner: { js: "const __noViteGlob = () => ({});" },
  jsx: "automatic",
});
await writeFile(
  `${out}/index.html`,
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>World Builder</title><link rel="stylesheet" href="./adapter.css"><style>body{margin:0}</style></head><body><div id="root"></div><script type="module" src="./adapter.mjs"></script></body></html>',
);
console.log(
  `Built standalone adapter into ${out}. No Director server required.`,
);

await cp("public/world-assets", `${out}/world-assets`, { recursive: true });
// The example track (`example-track.ts`), at the same relative path as in the studio.
const track = "media/director-templates/dimensions-mix/mix-track.mp3";
await mkdir(path.dirname(`${out}/${track}`), { recursive: true });
await cp(`public/${track}`, `${out}/${track}`);
