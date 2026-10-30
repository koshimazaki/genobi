/**
 * Klein and the image modes keep the studio still. Run against Vite:
 *   npx vite --port 4329 --strictPort &
 *   STUDIO_URL=http://127.0.0.1:4329 STUDIO_FIXTURE_API=1 node scripts/check-image-modes.mjs
 * At desktop and phone widths it moves Text to video → Klein (open) → Klein
 * (API) → FLUX 3 Image → Text to video through the model menu and the Run
 * control, and asserts the hero, composer, toolbar and gallery keep their
 * place and size (AGENTS.md, "Stable studio dimensions"). FLUX 3 video's
 * camera dialog keeps its Movements tab. On Klein it checks
 * the still's row: no duration, a camera switch, Camera controls without a
 * Movements tab, and the region canvas drawing a box. Nothing is submitted.
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const output = process.env.STUDIO_EVIDENCE ?? "/tmp/genobi-image-modes";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.CHROME_CHANNEL ?? "chrome",
});
const checks = [];
const errors = [];
const sources = JSON.parse(
  await readFile("public/media/gallery.json", "utf8"),
).map((source) => ({ ...source, origin: "sample" }));

const parts = {
  hero: ".featured-video",
  composer: "section.composer",
  toolbar: ".composer-toolbar",
  gallery: "section.gallery",
};

async function open(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.STUDIO_FIXTURE_API === "1")
    await page.route("**/api/**", (route) => {
      if (route.request().method() !== "GET") return route.abort();
      return route.fulfill({
        json:
          new URL(route.request().url()).pathname === "/api/health"
            ? { hasServerKey: false }
            : { jobs: [], sources },
      });
    });
  // No provider submissions, even with a local key configured.
  await page.route("**/api/jobs", (route) =>
    route.request().method() === "POST" ? route.abort() : route.fallback(),
  );
  await page.goto(base);
  const camera = page
    .getByRole("navigation", { name: "Studio presets" })
    .getByRole("button", { name: "Camera", exact: true });
  if (await camera.count()) await camera.click();
  await page.locator(parts.toolbar).waitFor();
  await page.waitForTimeout(600);
  return page;
}

/** Each part's box in page coordinates, so scrolling to draw does not count as a move. */
async function measure(page) {
  const rects = {};
  for (const [name, selector] of Object.entries(parts)) {
    const box = await page
      .locator(selector)
      .first()
      .evaluate((element) => {
        // Not rendered (the phone keeps the gallery in the closed Assets
        // rail): its empty box would only report the scroll position.
        if (!element.checkVisibility()) return { hidden: true };
        const r = element.getBoundingClientRect();
        return {
          x: r.x + scrollX,
          y: r.y + scrollY,
          width: r.width,
          height: r.height,
        };
      });
    rects[name] = Object.fromEntries(
      Object.entries(box).map(([k, v]) => [k, Math.round(v)]),
    );
  }
  return rects;
}

async function chooseModel(page, label) {
  await page.getByRole("button", { name: /^Change model:/ }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await page.waitForTimeout(400);
}

async function chooseRun(page, run) {
  await page.locator("#image-run").click();
  await page.getByRole("option", { name: run, exact: true }).click();
  await page.waitForTimeout(400);
}

function same(a, b, what) {
  for (const name of Object.keys(parts)) {
    // A hidden part must stay hidden; a shown one must not move.
    assert.equal(
      !!b[name].hidden,
      !!a[name].hidden,
      `${what}: ${name} was ${a[name].hidden ? "hidden" : "shown"} and is now ${b[name].hidden ? "hidden" : "shown"}`,
    );
    if (a[name].hidden) continue;
    for (const key of ["x", "y", "width", "height"])
      assert(
        Math.abs(a[name][key] - b[name][key]) <= 1,
        `${what}: ${name}.${key} moved from ${a[name][key]} to ${b[name][key]}`,
      );
  }
}

try {
  for (const [label, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["phone", { width: 390, height: 844 }],
  ]) {
    const page = await open(viewport);
    await chooseModel(page, "FLUX 3 · Text to video");
    const video = await measure(page);
    assert(await page.locator("#duration-label").count());
    // FLUX 3 makes stills too; its video camera keeps Movements.
    await page.getByRole("button", { name: /Camera controls/ }).click();
    const videoTabs = page.getByRole("tablist", { name: "Camera sections" });
    await videoTabs.waitFor();
    assert.equal(await videoTabs.getByRole("tab").count(), 3);
    assert.equal(
      await videoTabs.getByRole("tab", { name: /^Movements/ }).count(),
      1,
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await chooseModel(page, "FLUX 3 Image Klein · Image");
    const kleinOpen = await measure(page);
    same(video, kleinOpen, `${label} video → Klein open`);
    assert.equal(await page.locator("#duration-label").count(), 0);
    assert.equal(await page.locator("#draft-label").count(), 0);
    assert.equal(await page.locator("#camera-label").count(), 1);
    assert.equal(await page.locator("#image-run-value").innerText(), "Open");
    assert(
      await page.getByRole("region", { name: "Image editing stage" }).count(),
    );
    assert.match(
      await page.locator(".mode-badge").innerText(),
      /FLUX 3 Image Klein · Image/,
    );
    await page.screenshot({ path: `${output}/${label}-klein-open.png` });

    // A box on the stage: prompt coordinates, drawn on the region canvas.
    const canvas = page.locator(".image-region-canvas");
    await canvas.scrollIntoViewIfNeeded();
    const area = await canvas.boundingBox();
    await page.mouse.move(
      area.x + area.width * 0.2,
      area.y + area.height * 0.2,
    );
    await page.mouse.down();
    await page.mouse.move(
      area.x + area.width * 0.6,
      area.y + area.height * 0.7,
      {
        steps: 6,
      },
    );
    await page.mouse.up();
    await page
      .locator('[aria-label="Box 1"]')
      .waitFor({ timeout: 5000 })
      .catch(() => {
        throw new Error(`${label}: dragging on the region canvas drew no box`);
      });
    same(video, await measure(page), `${label} Klein with a box`);

    // The camera keeps its framing and loses movement for a still.
    await page.getByRole("button", { name: /Camera controls/ }).click();
    const tabs = page.getByRole("tablist", { name: "Camera sections" });
    await tabs.waitFor();
    assert.equal(await tabs.getByRole("tab").count(), 2);
    assert.equal(
      await tabs.getByRole("tab", { name: /^Movements/ }).count(),
      0,
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await chooseRun(page, "API");
    same(video, await measure(page), `${label} Klein open → API`);
    assert.match(
      await page.locator(".mode-badge").innerText(),
      /Klein · Image · API/,
    );

    await chooseModel(page, "FLUX 3 · Image");
    same(video, await measure(page), `${label} Klein → FLUX 3 Image`);
    assert.equal(await page.locator("#camera-label").count(), 0);
    assert.equal(await page.locator("#image-run-label").count(), 0);

    await chooseModel(page, "FLUX 3 · Text to video");
    same(video, await measure(page), `${label} image → video`);
    assert(await page.locator("#duration-label").count());
    checks.push(
      `${label}: hero, composer, toolbar and gallery hold across video, Klein open, Klein API and FLUX 3 Image; FLUX 3 video keeps three camera tabs; Klein shows no duration, a camera switch, two camera tabs and a drawable box`,
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(checks.map((c) => `ok - ${c}`).join("\n"));
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
