// Box 1.7: the dev server pre-bundles every package the browser code
// imports, so opening a lazy screen never makes Vite re-optimise and reload
// the page (the setup dialog came back at step one). A package added to
// `src/` or `shared/` without a line in vite.config.ts fails here.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import config, { PREBUNDLED } from "../vite.config";

const CODE = /\.(ts|tsx|js|mjs)$/;
function files(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return files(full);
    return CODE.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

/** Bare package imports that reach the browser: no types, styles or `?url`. */
function bareImports(source: string) {
  const found = new Set<string>();
  const pattern =
    /(?:^|\n)\s*import\s+(type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) continue;
    const name = match[2] ?? match[3];
    if (/^[./]/.test(name) || name.includes("?")) continue;
    if (name.startsWith("@fontsource") || name.endsWith(".css")) continue;
    found.add(name);
  }
  return found;
}

it("pre-bundles exactly the packages src/ and shared/ import", () => {
  const imported = new Set<string>();
  for (const file of [...files("src"), ...files("shared")])
    for (const name of bareImports(readFileSync(file, "utf8")))
      imported.add(name);
  // The React plugin adds its own JSX runtime.
  expect([...imported].sort()).toEqual([...PREBUNDLED].sort());
});

it("scans only the studio's page, so a stray HTML file cannot fail it", () => {
  expect(config.optimizeDeps?.entries).toEqual(["index.html"]);
  expect(config.optimizeDeps?.include).toBe(PREBUNDLED);
});

it("reads lazy, dynamic and multi-line imports, and skips type-only ones", () => {
  expect([
    ...bareImports(
      [
        'import * as THREE from "three";',
        "import {",
        "  a,",
        '} from "p5";',
        'const m = await import("animejs");',
        'import type { X } from "zod";',
        'import url from "onnxruntime-web/x.wasm?url";',
        'import "./local.css";',
      ].join("\n"),
    ),
  ]).toEqual(["three", "p5", "animejs"]);
});
