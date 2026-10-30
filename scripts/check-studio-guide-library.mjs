/** Local fixtures only: manual guide, reference navigation and stable Camera library hosts. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { names, overflow, targets } from "./lib/a11y-audit.mjs";
const base = process.env.STUDIO_URL ?? "http://127.0.0.1:5397";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".local/studio-guide-library";
await mkdir(output, { recursive: true });
const sources = JSON.parse(
  await readFile("public/media/gallery.json", "utf8"),
).map((source) => ({ ...source, origin: "sample" }));
const browser = await chromium.launch({ headless: true });
const checks = [];
async function fixtures(context) {
  await context.addInitScript(() =>
    localStorage.setItem("genobi.startup-guide.v1", "seen"),
  );
  await context.route("**/api/**", (route) => {
    assert.equal(route.request().method(), "GET", "Unexpected API mutation");
    return route.fulfill({ json: { jobs: [], sources, hasServerKey: false } });
  });
}
try {
  for (const width of [1440, 1280, 1000, 768, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    await fixtures(context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/?workspace=camera`);
    const guide = page.getByRole("dialog", {
      name: "One idea. A whole studio.",
    });
    await page
      .getByRole("button", { name: "Startup guide", exact: true })
      .click();
    await guide.waitFor();
    assert(await guide.evaluate((el) => el.contains(document.activeElement)));
    assert.deepEqual(await names(page), []);
    assert.deepEqual(await targets(page), []);
    assert.deepEqual(await overflow(page), []);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      assert(
        await guide.evaluate(
          (el) =>
            document.activeElement === document.body ||
            el.contains(document.activeElement),
        ),
      );
    }
    await page.screenshot({ path: `${output}/guide-${width}.png` });
    await page.keyboard.press("Escape");
    await guide.waitFor({ state: "detached" });
    assert.equal(new URL(page.url()).searchParams.get("workspace"), "camera");
    const guideButton = page.getByRole("button", {
      name: "Startup guide",
      exact: true,
    });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Startup guide",
    );
    await page.reload();
    await page.getByRole("button", { name: "Generate", exact: true }).waitFor();
    assert.equal(await guide.count(), 0);
    await guideButton.click();
    await guide.waitFor();
    await guide
      .getByRole("button", { name: "Open Camera", exact: true })
      .click();
    await guide.waitFor({ state: "detached" });
    const gallery = page.locator(".studio-main .gallery");
    await gallery.waitFor();
    const owner = await gallery.elementHandle();
    assert.equal(await page.locator(".gallery").count(), 1);
    const taste = page.getByRole("link", {
      name: "Taste reference library (opens in a new tab)",
    });
    assert.equal(await taste.getAttribute("href"), "/taste");
    assert.equal(await taste.getAttribute("target"), "_blank");
    assert(
      await taste.evaluate(
        (el) =>
          !el.closest(".genobi-presets") &&
          el.nextElementSibling.classList.contains("voice-mode"),
      ),
    );
    assert.equal(await page.locator(".taste-launch").count(), 0);
    if (width === 1440) {
      const [reference] = await Promise.all([
        context.waitForEvent("page"),
        taste.click(),
      ]);
      await reference.locator(".taste-page").waitFor();
      assert(new URL(reference.url()).pathname === "/taste");
      assert.equal(new URL(page.url()).searchParams.get("workspace"), "camera");
      await reference.close();
    }
    const assets = page.locator(".studio-assets-toggle");
    if ((await assets.getAttribute("aria-expanded")) !== "true")
      await assets.click();
    const tabs = page.getByRole("tablist", { name: "Asset collection" });
    assert.equal(await tabs.getByRole("tab").count(), 2);
    const project = tabs.getByRole("tab", { name: "Project", exact: true });
    await project.focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await tabs
        .getByRole("tab", { name: "Inspirations" })
        .getAttribute("aria-selected"),
      "true",
    );
    await page.keyboard.press("Home");
    assert.equal(await project.getAttribute("aria-selected"), "true");
    await assets.click();
    assert(await gallery.isVisible(), "Closing Assets hides Camera library");
    assert(await owner.evaluate((el) => el.isConnected));
    const composerBox = await page
      .locator(".genobi-panel-composer")
      .boundingBox();
    const galleryBox = await gallery.boundingBox();
    assert(galleryBox.y >= composerBox.y + composerBox.height - 1);
    await gallery
      .getByRole("button", { name: "This session", exact: true })
      .click();
    const nav = page.getByRole("navigation", { name: "Studio presets" });
    await nav.getByRole("button", { name: "Editor", exact: true }).click();
    await nav.getByRole("button", { name: "Camera", exact: true }).click();
    assert(
      await owner.evaluate(
        (el) => el.isConnected && !!el.closest(".studio-main"),
      ),
    );
    assert.equal(
      await gallery
        .getByRole("button", { name: "This session", exact: true })
        .getAttribute("class"),
      "active",
    );
    await gallery
      .getByRole("button", { name: "All media", exact: true })
      .click();
    await page.waitForTimeout(800);
    assert.deepEqual(await overflow(page), []);
    assert.deepEqual(await errors, []);
    await page.screenshot({
      path: `${output}/camera-${width}.png`,
      fullPage: true,
    });
    checks.push({
      width,
      manualGuide: true,
      reopen: true,
      libraryRetained: true,
      overflow: false,
    });
    await context.close();
  }
  const blocked = await browser.newContext();
  await fixtures(blocked);
  await blocked.addInitScript(() => {
    for (const method of ["getItem", "setItem"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (key, ...args) {
        if (["genobi.startup-guide.v1", "genobi-setup-seen-v1"].includes(key))
          throw new Error("Blocked storage fixture");
        return original.call(this, key, ...args);
      };
    }
  });
  const page = await blocked.newPage();
  await page.goto(`${base}/?workspace=editor`);
  await page.getByRole("button", { name: "Skip setup for now" }).click();
  assert.equal(new URL(page.url()).searchParams.get("workspace"), "editor");
  await page.reload();
  await page
    .getByRole("dialog", { name: "A little setup. A lot to create." })
    .waitFor();
  checks.push({
    blockedStorage: "welcome remains dismissible and returns on reload",
    deepLink: "preserved",
  });
  await blocked.close();
  await writeFile(`${output}/report.json`, JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
