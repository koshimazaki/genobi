import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Every package the studio's browser code imports, pre-bundled when the dev
 * server starts (the setup design, Box 1.7). Most are first reached
 * through a lazy screen (`lazyReload`) or a dynamic `import()`. Whenever
 * Vite's start-up scan missed them, it found them only as that screen
 * opened, bundled them again and reloaded the page under the person, setup
 * dialog and all. `tests/vite-prebundle.test.ts` keeps this list equal to the
 * imports in `src/` and `shared/`; `npm run check:no-reload` opens every
 * screen on a fresh cache and fails on a re-optimisation or a reload.
 */
export const PREBUNDLED = [
  "@pixiv/three-vrm",
  "animejs",
  "cli-spinners",
  "fflate",
  "mediabunny",
  "mp4box",
  "onnxruntime-web/wasm",
  "p5",
  "react",
  "react-dom",
  "react-dom/client",
  "three",
  "three/addons/controls/OrbitControls.js",
  "three/addons/controls/TransformControls.js",
  "three/addons/loaders/DRACOLoader.js",
  "three/addons/loaders/FBXLoader.js",
  "three/addons/loaders/GLTFLoader.js",
  "three/addons/math/Capsule.js",
  "three/addons/math/Octree.js",
  "three/addons/utils/SkeletonUtils.js",
  "three/examples/jsm/controls/OrbitControls.js",
  "three/examples/jsm/effects/AsciiEffect.js",
  "three/examples/jsm/loaders/GLTFLoader.js",
  "zod",
  "zustand",
  "zustand/vanilla",
];

const PUBLIC_JSON = "\0public-json:";

/**
 * Dev only: the clip catalogue (`public/media/gallery.json`) and the motion
 * presets (`public/motion/presets.json`) stay in `public/`, because the local
 * server reads the catalogue beside its clips and agents read the presets at
 * `/motion/presets.json`, yet the app also imports both. Vite serves such an
 * import at a `/public/…` URL and warns on every load, so this serves a JSON
 * file under `public/` that source code imports as a plain module instead.
 * The build already bundles them without a warning, so it is left alone.
 */
export function publicJsonImports(): Plugin {
  let publicDir = "";
  return {
    name: "genobi:public-json",
    apply: "serve",
    enforce: "pre",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".") || !source.endsWith(".json"))
        return null;
      const file = path.resolve(path.dirname(importer.split("?")[0]), source);
      return publicDir && file.startsWith(publicDir + path.sep)
        ? PUBLIC_JSON + path.relative(publicDir, file)
        : null;
    },
    async load(id) {
      if (!id.startsWith(PUBLIC_JSON)) return null;
      const file = path.join(publicDir, id.slice(PUBLIC_JSON.length));
      this.addWatchFile(file);
      // Raw JSON: Vite's own JSON plugin turns it into the module, as usual.
      return readFile(file, "utf8");
    },
  };
}

export default defineConfig({
  plugins: [publicJsonImports(), react()],
  server: {
    host: "127.0.0.1",
    allowedHosts: ["terminal.local"],
    watch: {
      ignored: [
        "**/custom_nodes/**/web/**",
        "**/.pages/**",
        "**/.pages-project/**",
        // Voice models and their venv, installed beside the checkout.
        "**/models/**",
      ],
    },
  },
  optimizeDeps: {
    // The studio's one page. Without it Vite scans every HTML file under the
    // checkout, gitignored review renders in `output/` included, and one
    // whose script is missing fails the whole scan.
    entries: ["index.html"],
    include: PREBUNDLED,
  },
  build: { target: "es2022" },
  // `vitest run` walks the tree for test files; the gitignored `.local/` data
  // and nested `.claude/worktrees/` checkouts (whole copies of this repo, each
  // with their own tests) otherwise make a full run crawl for many minutes.
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/.local/**",
      "**/.claude/worktrees/**",
      "**/output/**",
      "**/models/**",
    ],
  },
});
