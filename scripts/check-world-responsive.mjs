/** Real phone-width regression of 3D catalogue, duration, Assets and lightbox. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve(
  process.env.WORLD_PHONE_EVIDENCE ?? "/tmp/genobi-world-phone",
);
await mkdir(output, { recursive: true });
const server = await createServer({
  cacheDir: resolve(output, "vite-cache"),
  server: { host: "127.0.0.1", port: 4503, strictPort: true },
});
await server.listen();
const base = "http://127.0.0.1:4503";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  channel: process.env.CHROME_BIN ? undefined : "chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-features=LocalNetworkAccessChecks"],
});
const report = {
  viewport: { width: 390, height: 844 },
  checks: [],
  errors: [],
};
const context = await browser.newContext({
  viewport: report.viewport,
  reducedMotion: "reduce",
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await context.addInitScript(() =>
  localStorage.setItem("genobi-setup-seen-v1", "1"),
);
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== base) return route.abort();
  if (url.pathname.startsWith("/api/"))
    return route.request().method() === "GET"
      ? route.fulfill({ json: { jobs: [], sources: [] } })
      : route.abort();
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
const noOverflow = async (stage) => {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.document <= dimensions.viewport + 1,
    `${stage}: ${JSON.stringify(dimensions)}`,
  );
  report.checks.push({ stage, noPageOverflow: true, ...dimensions });
};
const loadedRecipe = () =>
  page.evaluate(() => JSON.stringify(window.directorScene.getRecipe()));
try {
  await page.goto(`${base}/world-builder`);
  await page.waitForFunction(() => window.directorScene, null, {
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "Expand 3D scene", exact: true })
    .waitFor();
  await noOverflow("initial");
  const original = await loadedRecipe();
  await page
    .getByRole("button", { name: "Build a morph", exact: true })
    .click();
  const composer = page.getByRole("region", {
    name: "Build a morph",
    exact: true,
  });
  await composer.waitFor();
  await composer.getByLabel("Include Chamber", { exact: true }).check();
  await composer.getByLabel("Include Mecha", { exact: true }).check();
  assert.equal(
    await composer.locator('input[type="checkbox"]:checked').count(),
    4,
  );
  assert.equal(
    await composer.getByLabel("Include Apple", { exact: true }).isDisabled(),
    true,
  );
  await composer
    .getByRole("button", { name: "Move form D earlier", exact: true })
    .click();
  assert.equal(
    await composer
      .getByLabel("Include Mecha", { exact: true })
      .locator("..")
      .locator("b")
      .innerText(),
    "C",
  );
  const fader = composer.getByLabel("Total morph time slider", { exact: true });
  await fader.focus();
  await page.keyboard.press("End");
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Total morph time slider"]')
        ?.value === "721",
  );
  assert.equal(
    await composer
      .getByRole("button", { name: "Load morph", exact: true })
      .isEnabled(),
    true,
  );
  const layout = await composer.evaluate((root) => {
    const bounds = root.getBoundingClientRect();
    const elements = [
      ...root.querySelectorAll(
        'button, input:not([type="checkbox"]), select, .wb-morph-asset',
      ),
    ].filter((el) => el.checkVisibility());
    return {
      width: bounds.width,
      outside: elements
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
        })
        .map((el) => el.getAttribute("aria-label") ?? el.textContent.trim()),
      short: elements
        .filter((el) => el.getBoundingClientRect().height < 43.5)
        .map((el) => el.getAttribute("aria-label") ?? el.textContent.trim()),
    };
  });
  assert.deepEqual(layout.outside, [], "Composer controls fit their panel");
  assert.deepEqual(
    layout.short,
    [],
    "Composer controls and tick tiles have 44px touch targets",
  );
  report.checks.push({
    stage: "composer",
    ...layout,
    tickedForms: 4,
    frames: 721,
  });
  await noOverflow("four forms");
  await composer
    .getByRole("button", { name: "Play morph draft", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('input[aria-label="Morph composition preview"]')
          ?.value,
      ) > 0.02,
  );
  await composer
    .getByRole("button", { name: "Pause morph draft", exact: true })
    .click();
  const draftScrub = composer.getByLabel("Morph composition preview", {
    exact: true,
  });
  await draftScrub.focus();
  await page.keyboard.press("End");
  assert.equal(await draftScrub.inputValue(), "1");
  assert.equal(
    await loadedRecipe(),
    original,
    "Draft choices and preview leave the loaded scene untouched",
  );
  await composer
    .getByRole("button", { name: "Load morph", exact: true })
    .click();
  await page.waitForFunction(
    () => window.directorScene.getRecipe().frames === 721,
  );
  assert.equal(
    await page.evaluate(
      () => window.directorScene.getRecipe().motion.stateKeys.length,
    ),
    4,
  );
  await noOverflow("loaded four-form take");
  report.checks.push({
    stage: "draft transport",
    playPauseScrub: true,
    explicitLoad: true,
  });

  const loop = page.getByRole("region", { name: "Loop panel", exact: true });
  await loop.getByRole("button", { name: "Save A", exact: true }).click();
  await loop.getByRole("button", { name: "Save B", exact: true }).waitFor();
  const loaded = await loadedRecipe();
  const scrub = page.getByLabel("Preview frame", { exact: true });
  await scrub.focus();
  await page.keyboard.press("End");
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Preview frame"]')?.value ===
      "720",
  );
  await loop.getByRole("button", { name: "Save B", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".wb-loop-panel > header > span")?.textContent ===
      "2 / 4 saved",
  );
  assert.equal(
    await loadedRecipe(),
    loaded,
    "Saving slots does not replace the loaded recipe",
  );
  const loopTime = loop.getByLabel("Loop duration slider", { exact: true });
  await loopTime.focus();
  await page.keyboard.press("End");
  assert.equal(await loopTime.inputValue(), "721");
  await loop
    .locator(".wb-loop-options > details > summary")
    .filter({ hasText: "Movement" })
    .click();
  await loop
    .locator(".wb-loop-options > details > summary")
    .filter({ hasText: "Audio" })
    .click();
  const loopLayout = await loop.evaluate((root) => {
    const bounds = root.getBoundingClientRect();
    const elements = [
      ...root.querySelectorAll(
        'button, input:not([type="checkbox"]), select, summary, .wb-check',
      ),
    ].filter((el) => el.checkVisibility());
    return {
      width: bounds.width,
      outside: elements
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
        })
        .map((el) => el.getAttribute("aria-label") ?? el.textContent.trim()),
      short: elements
        .filter((el) => el.getBoundingClientRect().height < 43.5)
        .map((el) => el.getAttribute("aria-label") ?? el.textContent.trim()),
    };
  });
  assert.deepEqual(loopLayout.outside, [], "Loop controls fit at phone width");
  assert.deepEqual(
    loopLayout.short,
    [],
    "Loop controls have 44px touch targets",
  );
  await loop
    .locator(".wb-loop-options > details > summary")
    .filter({ hasText: "Movement" })
    .click();
  await loop
    .locator(".wb-loop-options > details > summary")
    .filter({ hasText: "Audio" })
    .click();
  await loop.getByRole("button", { name: "Play loop", exact: true }).click();
  await page.waitForFunction(() => {
    const recipe = window.directorScene.getRecipe();
    return (
      recipe.frames === 721 &&
      recipe.motion.stateKeys.at(-1).id === "loop-return-A"
    );
  });
  await loop.getByRole("button", { name: "Pause loop", exact: true }).click();
  const loopScreenshot = await loop.screenshot();
  await writeFile(resolve(output, "loop-panel-phone.png"), loopScreenshot);
  await writeFile(
    resolve("docs/media/world-loop-phone-ui.png"),
    loopScreenshot,
  );
  await noOverflow("global Loop panel");
  report.checks.push({
    stage: "loop desk",
    ...loopLayout,
    savedSlots: 2,
    frameGrid: 721,
    returnToA: true,
    explicitPlayPause: true,
  });

  await page.locator(".studio-assets-toggle").click();
  await page.locator(".studio-asset-rail:visible").waitFor();
  const shelf = await page.evaluate(() => {
    const rail = document.querySelector(".studio-asset-rail");
    const box = rail.getBoundingClientRect();
    const main = document.querySelector(".studio-main").getBoundingClientRect();
    const workspace = document
      .querySelector(".studio-workspace")
      .getBoundingClientRect();
    return {
      position: getComputedStyle(rail).position,
      x: box.x,
      width: box.width,
      top: box.top,
      workspaceX: workspace.x,
      workspaceWidth: workspace.width,
      mainBottom: main.bottom,
    };
  });
  assert.equal(shelf.position, "static");
  assert(
    Math.abs(shelf.x - shelf.workspaceX) < 1 &&
      Math.abs(shelf.width - shelf.workspaceWidth) < 1,
    "Assets use the full workspace width",
  );
  assert(
    shelf.top >= shelf.mainBottom - 1,
    "Assets sit below the 3D workspace",
  );
  await noOverflow("bottom Assets shelf");
  report.checks.push({ stage: "bottom Assets", ...shelf });
  await page
    .locator(".studio-asset-rail")
    .screenshot({ path: resolve(output, "assets-phone.png") });
  await page.getByRole("button", { name: "Hide assets", exact: true }).click();

  const canvas = await page
    .locator('canvas[aria-label="World Builder scene"]')
    .elementHandle();
  await page
    .getByRole("button", { name: "Expand 3D scene", exact: true })
    .click();
  const dialog = page.locator("dialog.wb-viewport-dialog[open]");
  await dialog.waitFor();
  assert.equal(
    await dialog
      .locator("canvas")
      .evaluate((element, original) => element === original, canvas),
    true,
  );
  const sceneScrub = dialog.getByLabel("Preview frame", { exact: true });
  await sceneScrub.focus();
  await page.keyboard.press("End");
  await page.waitForFunction(
    () =>
      document.querySelector('dialog[open] input[aria-label="Preview frame"]')
        ?.value === "720",
  );
  const expanded = await dialog.boundingBox();
  assert(
    expanded.width <= 390 && expanded.height <= 844,
    "Lightbox fits the phone viewport",
  );
  await noOverflow("expanded viewport");
  await page.screenshot({ path: resolve(output, "lightbox-phone.png") });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Expand 3D scene", exact: true })
      .evaluate((element) => document.activeElement === element),
    true,
  );
  assert.equal(
    await page
      .locator('canvas[aria-label="World Builder scene"]')
      .evaluate((element, original) => element === original, canvas),
    true,
  );
  await page.locator('canvas[aria-label="World Builder scene"]').dblclick();
  await dialog.waitFor();
  await dialog
    .getByRole("button", { name: "Close expanded 3D scene", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  report.checks.push({
    stage: "lightbox",
    sameCanvas: true,
    scrubFrame: 720,
    escapeFocus: true,
    doubleClickClose: true,
    ...expanded,
  });
  await noOverflow("lightbox closed");
  await composer.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve("docs/media/world-morph-phone-ui.png"),
    fullPage: true,
  });
  assert.deepEqual(report.errors, [], "No uncaught browser errors");
  report.result = "PASS";
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.result = "FAIL";
  report.failure = String(error);
  await page.screenshot({
    path: resolve(output, "failure-phone.png"),
    fullPage: true,
  });
  console.log(JSON.stringify(report, null, 2));
  throw error;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await server.close();
}
