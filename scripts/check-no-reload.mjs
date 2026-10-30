// Box 1.7: the dev server never re-optimises dependencies while a person is
// in the studio. Starts Vite's development middleware the way the local
// server does (`server/dev-server.ts`, same root and vite.config.ts) on a
// fresh dependency cache, opens every screen in Chromium with the API
// stubbed, and fails when Vite logs "new dependencies optimized" or the page
// reloads itself. It also walks setup, types keys, reloads on purpose and
// checks the draft comes back at the same step without any key in storage.
//
// By default it also leaves a stray page in the gitignored `output/` (a
// review render whose script is missing, as the owner's checkout had), which
// used to fail Vite's scan; it is removed again at the end.
//
//   npm run check:no-reload            fresh cache (removes node_modules/.vite)
//   npm run check:no-reload -- --keep-cache --no-stray --screens-only
//
// The real local server is not started: it reads the Keychain at start and
// its agent routes run the harnesses' status commands. Nothing here spends,
// signs in or installs; every /api request is answered by the fixtures below.
import assert from "node:assert/strict";
import { mkdir, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { chromium } from "playwright";
import { createLogger, createServer } from "vite";
import { devServerOptions } from "../server/dev-server.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4477);
const keep = process.argv.includes("--keep-cache");
const stray = process.argv.includes("--no-stray")
  ? undefined
  : path.join(root, "output/no-reload-check");
const SECRETS = ["comfyui-walk-SECRET-0001", "bfl-walk-SECRET-0002"];
if (!keep)
  await rm(path.join(root, "node_modules/.vite"), {
    recursive: true,
    force: true,
  });

if (stray) {
  await mkdir(stray, { recursive: true });
  await writeFile(
    path.join(stray, "index.html"),
    '<!doctype html><script type="module" src="missing.mjs"></script>\n',
  );
}

// Vite's own log, kept so the walk can say what it printed.
const log = [];
const base = createLogger("info");
const logger = {
  ...base,
  info(message, options) {
    log.push(message);
    base.info(message, options);
  },
  warn(message, options) {
    log.push(message);
    base.warn(message, options);
  },
  error(message, options) {
    log.push(message);
    base.error(message, options);
  },
};
const vite = await createServer({
  ...devServerOptions(root, port),
  customLogger: logger,
});
const app = express();
app.use(vite.middlewares);
const server = app.listen(port, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${port}`;
console.log(
  `Vite middleware on ${origin} (fresh cache: ${!keep}, stray page: ${!!stray})`,
);

const slot = { connected: false, revision: 0 };
const fixtures = {
  "/api/health": { hosted: false, hasServerKey: false },
  "/api/keys": {
    keys: { keychain: true, comfy: slot, bfl: slot },
  },
  "/api/agent/runners": { runners: [] },
  "/api/agent/status": {
    available: false,
    message: "No agent is set up on this server.",
  },
  "/api/agent/sessions": null,
  "/api/settings/agent-runner": {
    saved: { runner: null },
    environment: false,
    hermesProvider: false,
  },
  "/api/agent/sign-in": {
    harnesses: [
      {
        runner: "claude",
        name: "Claude Code",
        installed: false,
        signedIn: false,
      },
      { runner: "hermes", name: "Hermes", installed: false, signedIn: false },
      { runner: "codex", name: "Codex", installed: false, signedIn: false },
    ],
  },
  "/api/voice/status": { available: false, maxSeconds: 0 },
  "/api/projects": { projects: [] },
  "/api/jobs": { jobs: [], sources: [] },
};

const browser = await chromium.launch({
  headless: !process.argv.includes("--headed"),
});
const failures = [];
const report = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: "reduce",
  });
  const writes = [];
  await context.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${url.pathname}`);
      // Continue saves the harness; the answer is the state, nothing stored.
      if (url.pathname === "/api/settings/agent-runner")
        return route.fulfill({ json: fixtures[url.pathname] });
      return route.fulfill({ status: 404, json: { error: "Stubbed." } });
    }
    if (url.pathname in fixtures)
      return route.fulfill({ json: fixtures[url.pathname] });
    return route.fulfill({ status: 404, json: { error: "Stubbed." } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Each document load; only the ones this walk asked for are expected.
  let loads = 0;
  page.on("load", () => loads++);
  let asked = 0;
  const visit = async (url) => {
    asked++;
    await page.goto(`${origin}${url}`, { waitUntil: "load" });
  };
  /** Waits until the page has been quiet, so a late re-optimise shows. */
  const settle = async () => {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);
  };

  // 1. The studio home with setup open on a first visit.
  await visit("/");
  const dialog = page.locator("dialog.genobi-setup");
  await dialog.waitFor({ state: "visible" });
  report.push("studio home + setup dialog");
  if (process.argv.includes("--screens-only")) {
    await dialog.getByRole("button", { name: "Explore first" }).click();
  } else {
    await dialog.getByRole("button", { name: /Let’s set up/ }).click();
    await dialog.getByRole("button", { name: /^Open models only/ }).click();
    await dialog.getByRole("button", { name: /^Yes · Hermes/ }).click();
    await dialog.getByRole("button", { name: /^Mix of all/ }).click();
    await dialog.getByRole("button", { name: /^Research only/ }).click();
    // The Connect step: keys typed, never saved (the PUT is stubbed away).
    const fields = ["#key-comfy", "#key-bfl"];
    for (const [index, field] of fields.entries())
      await dialog.locator(field).fill(SECRETS[index]);
    await settle();
    const stored = await page.evaluate(() => ({
      session: JSON.stringify({ ...sessionStorage }),
      local: JSON.stringify({ ...localStorage }),
    }));
    for (const secret of SECRETS) {
      assert(!stored.session.includes(secret), "a key reached sessionStorage");
      assert(!stored.local.includes(secret), "a key reached localStorage");
    }
    assert.match(stored.session, /genobi-setup-draft/);
    report.push("setup: keys typed, none in session or local storage");

    // A deliberate reload comes back on the Connect step with the choices.
    await page.reload();
    asked++;
    await dialog.waitFor({ state: "visible" });
    await dialog
      .getByRole("heading", { name: /Connect your keys and agent/ })
      .waitFor();
    for (const field of fields)
      assert.equal(
        await dialog.locator(field).inputValue(),
        "",
        "a key came back",
      );
    await dialog.getByRole("button", { name: /^Continue/ }).click();
    await dialog
      .getByRole("heading", { name: /Your studio, your way/ })
      .waitFor();
    const summary = await dialog.innerText();
    assert.match(summary, /Open creative models/);
    assert.match(summary, /Hermes/);
    assert.match(summary, /Research only/);
    await dialog.getByRole("checkbox", { name: /Add local voice/ }).check();
    report.push("setup: reload restored the Connect step, then the summary");
    await dialog.getByRole("button", { name: "Save & explore" }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.doesNotMatch(
      await page.evaluate(() => JSON.stringify({ ...sessionStorage })),
      /genobi-setup-draft/,
      "finishing setup must clear the draft",
    );
  }
  await settle();

  // 2. Every studio screen, through the studio's own navigation.
  const screens = [
    "camera",
    "director",
    "editor",
    "world",
    "dual",
    "scrolls",
    "tools",
    "ninja",
    "gallery",
  ];
  for (const id of screens) {
    await page.locator(`[data-preset-button="${id}"]`).click();
    await settle();
    report.push(`screen: ${id}`);
  }
  // Project Tools' other tabs (Arena is the first; Development is lazy).
  await page.locator('[data-preset-button="tools"]').click();
  const tools = page.getByRole("group", { name: "Project tools" });
  for (const name of ["Development", "Arena"]) {
    await tools.getByRole("button", { name, exact: true }).first().click();
    await settle();
    report.push(`screen: tools / ${name}`);
  }
  // 3. Pages outside the shell: Taste (its ASCII study) and direct routes.
  for (const url of [
    "/taste",
    "/director?example=anime-teaser",
    "/scrolls",
    "/dual-editor",
    "/world-builder",
  ]) {
    await visit(url);
    await settle();
    report.push(`page: ${url}`);
  }

  const optimized = log.filter((line) =>
    /new dependencies optimized|optimized dependencies changed/i.test(line),
  );
  if (optimized.length)
    failures.push(`Vite re-optimised:\n${optimized.join("\n")}`);
  if (loads !== asked)
    failures.push(`The page loaded ${loads} times for ${asked} navigations.`);
  const hooks = errors.filter((text) =>
    /Invalid hook call|reading 'useState'/.test(text),
  );
  if (hooks.length) failures.push(`Stale chunk errors:\n${hooks.join("\n")}`);
  console.log(report.map((line) => `  ok ${line}`).join("\n"));
  console.log(`Document loads: ${loads}, navigations asked: ${asked}`);
  console.log(
    `Writes answered by the stub (none reach a server): ${writes.length}`,
  );
  if (errors.length)
    console.log(`Page errors (not failures):\n  ${errors.join("\n  ")}`);
} finally {
  await browser.close();
  server.close();
  await vite.close();
  if (stray) {
    await rm(stray, { recursive: true, force: true });
    // `output/` itself only when the walk made it.
    await rmdir(path.dirname(stray)).catch(() => {});
  }
}
if (failures.length) {
  console.error(`\nFAILED\n${failures.join("\n\n")}`);
  process.exit(1);
}
console.log("\nNo dependency re-optimisation and no unasked reload.");
