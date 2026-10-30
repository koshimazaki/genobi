// Run against a local studio. All API requests are fixtures; nothing installs or spends.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { names, targets } from "./lib/a11y-audit.mjs";
const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4317";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const output = process.env.STUDIO_EVIDENCE ?? "/tmp/genobi-setup-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const writes = [],
      errors = [];
    await context.route("**/api/**", (route) => {
      if (route.request().method() !== "GET") {
        writes.push(route.request().url());
        return route.abort();
      }
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/voice/status")
        return route.fulfill({
          status: 404,
          json: { error: "Local route only" },
        });
      return route.fulfill({
        json:
          path === "/api/health"
            ? { hasServerKey: false }
            : { jobs: [], sources: [] },
      });
    });
    await context.addInitScript(() => {
      window.setupMicRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        window.setupMicRequests++;
        throw new Error("Setup must not request the microphone");
      };
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    const dialog = page.locator("dialog.genobi-setup");
    await dialog.waitFor({ state: "visible" });
    assert(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    );
    assert.equal(
      await dialog
        .locator(".brand-mark")
        .evaluate((node) => getComputedStyle(node).animationName),
      "none",
    );
    assert.deepEqual(await names(page), []);
    assert.deepEqual(await targets(page), []);
    await page.screenshot({ path: `${output}/welcome-${width}.png` });
    await dialog.getByRole("button", { name: /Let’s set up/ }).click();
    await dialog.getByRole("button", { name: /^Open models only/ }).click();
    await dialog.getByRole("button", { name: /^I prefer Claude Code/ }).click();
    await dialog.getByRole("button", { name: /^Web based/ }).click();
    await dialog.getByRole("button", { name: /^Client or commercial/ }).click();
    assert.match(await dialog.innerText(), /Open creative models/);
    assert.match(await dialog.innerText(), /Claude Code/);
    assert.match(await dialog.innerText(), /Commercial videos/);
    await dialog.getByRole("button", { name: /Back/ }).click();
    await dialog.getByRole("button", { name: /^Decide later/ }).click();
    assert.match(await dialog.innerText(), /Purpose not specified/);
    await dialog.getByRole("button", { name: /Back/ }).click();
    await dialog.getByRole("button", { name: /^Client or commercial/ }).click();
    await dialog.getByRole("checkbox", { name: /Add local voice/ }).check();
    await dialog.getByText(/Local voice is unavailable here/).waitFor();
    assert.equal(
      await dialog
        .getByRole("button", { name: "Set up local voice", exact: true })
        .count(),
      0,
    );
    assert(
      await dialog.getByRole("link", { name: /GitHub repository/ }).isVisible(),
    );
    assert(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    );
    assert.equal(await page.evaluate(() => window.setupMicRequests), 0);
    assert.deepEqual(writes, []);
    await page.screenshot({ path: `${output}/choices-${width}.png` });
    if (width === 1440) {
      await dialog
        .getByRole("button", { name: "Save & connect provider" })
        .click();
      await page.getByRole("heading", { name: "Studio settings" }).waitFor();
      await page.keyboard.press("Escape");
    } else {
      await dialog.getByRole("button", { name: "Save & explore" }).click();
    }
    await page.reload();
    await page
      .getByRole("button", { name: "Open Genobi activity", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Set up Genobi", exact: true })
      .click();
    await dialog.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("genobi-model-selection-v1")),
    );
    assert.deepEqual(saved, {
      weights: "open-weights",
      agent: "claude",
      execution: "cloud",
    });
    assert.deepEqual(errors, []);
    await context.close();
  }
  // A supported local server offers confirmation, never installation on entry.
  const local = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const writes = [];
  await local.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().url());
      return route.abort();
    }
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/api/voice/status"
          ? { available: false, maxSeconds: 180 }
          : path === "/api/voice/setup"
            ? {
                token: "fixture-only",
                model: "Qwen3-ASR",
                bytes: 2000000000,
                folder: "/tmp/fixture-only",
                browse: false,
                supported: true,
                state: { phase: "idle", bytes: 0, busy: false },
              }
            : { jobs: [], sources: [] },
    });
  });
  const page = await local.newPage();
  await page.goto(base);
  const dialog = page.locator("dialog.genobi-setup");
  await dialog.getByRole("button", { name: /Let’s set up/ }).click();
  await dialog.getByRole("button", { name: /^Open models only/ }).click();
  await dialog.getByRole("button", { name: /Back/ }).click();
  assert.equal(
    await dialog
      .getByRole("button", { name: /^Open models only/ })
      .getAttribute("aria-pressed"),
    "true",
  );
  await dialog.getByRole("button", { name: /^Open models only/ }).click();
  await dialog.getByRole("button", { name: /^Yes · Hermes/ }).click();
  await dialog.getByRole("button", { name: /^Local only/ }).click();
  await dialog
    .getByRole("button", { name: /^Explore and make personal/ })
    .click();
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("genobi-model-selection-v1"),
    ),
    null,
  );
  await dialog.getByRole("checkbox", { name: /Add local voice/ }).check();
  await dialog
    .getByRole("button", { name: "Set up local voice", exact: true })
    .click();
  await dialog.getByRole("heading", { name: "Install Voice Mode?" }).waitFor();
  await dialog
    .getByRole("textbox", { name: "Voice installation folder" })
    .waitFor();
  assert.equal(
    await dialog
      .getByRole("button", { name: "Save & connect provider" })
      .count(),
    0,
  );
  assert.deepEqual(writes, []);
  await page.screenshot({ path: `${output}/local-voice-confirmation-390.png` });
  await page.keyboard.press("Escape");
  assert.equal(
    await dialog.getByRole("heading", { name: "Install Voice Mode?" }).count(),
    0,
  );
  assert(await dialog.isVisible(), "Voice Escape must preserve onboarding");
  await dialog.getByRole("button", { name: "Skip setup for now" }).click();
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("genobi-model-selection-v1"),
    ),
    null,
  );
  await local.close();
  console.log(
    "Startup flow: mobile/desktop, preferences, reopen, reduced motion and no side effects passed.",
  );
} finally {
  await browser.close();
}
