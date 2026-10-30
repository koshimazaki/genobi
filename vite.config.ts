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

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
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
