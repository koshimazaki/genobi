// A default voice install puts a model and its Python venv (with bundled JS)
// in `models/` beside the checkout. Lint, Vitest, the Vite watcher, Prettier
// and git must all leave it alone.
import { readFileSync } from "node:fs";
import { ESLint } from "eslint";
import { expect, it } from "vitest";
import config from "../vite.config";

it("ESLint ignores anything under models/", async () => {
  const eslint = new ESLint();
  expect(
    await eslint.isPathIgnored(
      "models/genobi-voice-abc/environment/lib/site-packages/gradio/x.js",
    ),
  ).toBe(true);
  // Source beside it is still linted.
  expect(await eslint.isPathIgnored("server/voice-discovery.ts")).toBe(false);
});

it("Vitest and the Vite watcher skip models/", () => {
  expect(config.test?.exclude).toContain("**/models/**");
  expect(config.server?.watch?.ignored).toContain("**/models/**");
});

it("Prettier and git skip models/", () => {
  expect(readFileSync(".prettierignore", "utf8")).toMatch(/^models\/$/m);
  expect(readFileSync(".gitignore", "utf8")).toMatch(/^\/models\/$/m);
});
