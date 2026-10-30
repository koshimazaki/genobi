// The three house templates (docs/templates.md) open in the Director.
// Start Vite first; Chrome is the default, DIRECTOR_BROWSER=chromium for an
// installed Playwright browser, DIRECTOR_URL for another local server.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5175";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const out = ".local/director";
await mkdir(out, { recursive: true });
// What each template must show. Kept here rather than imported so the page is
// checked against an independent copy of shared/templates/catalogue.ts.
const expected = {
  "product-video": {
    name: "Product video",
    size: "640 × 360",
    shots: ["hero", "detail", "reveal"],
    tracks: ["shots", "title"],
  },
  "character-piece": {
    name: "Character piece",
    size: "360 × 640",
    shots: ["arrive", "turn", "hold"],
    tracks: ["shots", "title"],
  },
  "audio-visual": {
    name: "Audio-visual",
    size: "640 × 360",
    shots: ["slice", "rise", "sweep"],
    tracks: ["track", "shots", "pulse", "title"],
  },
};
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  // No generation may leave a template check.
  await page.route("**/api/jobs", (route) =>
    route.request().method() === "POST" ? route.abort() : route.fallback(),
  );
  const ready = () =>
    page
      .getByText("Ready · local preview", { exact: true })
      .waitFor({ timeout: 30000 });
  const presets = () =>
    page.getByRole("navigation", { name: "Studio presets" }).boundingBox();
  const stage = () =>
    page.locator('canvas[aria-label="Director preview"]').boundingBox();
  const meta = () => page.locator(".dir-stage-meta").innerText();

  // The plain Director is the reference: a template link must not move the
  // preset toolbar or the stage.
  await page.goto(`${base}/director`);
  await ready();
  const toolbar = await presets();
  const stageTop = (await stage()).y;

  for (const [id, want] of Object.entries(expected)) {
    await page.goto(`${base}/director?example=${id}`);
    await ready();
    assert.deepEqual(await presets(), toolbar, `${id}: toolbar moved`);
    assert.equal((await stage()).y, stageTop, `${id}: stage moved`);
    assert.match(await meta(), new RegExp(want.size));
    await page.getByText(want.name, { exact: true }).first().waitFor();
    assert.deepEqual(
      await page
        .locator("[data-shot]")
        .evaluateAll((items) => items.map((i) => i.dataset.shot)),
      want.shots,
    );
    assert.deepEqual(
      (
        await page
          .locator("[data-track]")
          .evaluateAll((items) => items.map((i) => i.dataset.track))
      ).sort(),
      [...want.tracks].sort(),
    );
    if (id === "audio-visual")
      assert.equal(
        await page.locator("[data-room]").textContent(),
        "Cathedral · Moderate",
      );
    await page.screenshot({ path: `${out}/template-${id}.png` });
    console.log(`PASS ${id} opens in the Director with its shots and tracks`);

    await page
      .getByRole("navigation", { name: "Studio presets" })
      .getByRole("button", { name: "Editor", exact: true })
      .click();
    await ready();
    for (const track of want.tracks)
      await page.locator(`[data-lane="${track}"]`).first().waitFor();
    assert.deepEqual(
      await page
        .locator('[data-lane="shots"] .dir-clip')
        .evaluateAll((clips) => clips.map((c) => c.dataset.layerId)),
      want.shots.map((s) => `shot-${s}`),
    );
    console.log(`PASS ${id} lanes and shot clips in the Editor`);
  }

  // A generated clip replaces a plate in place: the still becomes a video and
  // the shot keeps its start and length.
  await page.goto(`${base}/director?example=product-video&workspace=editor`);
  await ready();
  const reveal = page.locator('.dir-clip[data-layer-id="shot-reveal"]');
  await page
    .getByRole("button", { name: "Select 03 Reveal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show inspector", exact: true })
    .click();
  const timing = async () => [
    await page.getByLabel("Start frame", { exact: true }).inputValue(),
    await page.getByLabel("Duration frames", { exact: true }).inputValue(),
  ];
  const before = await timing();
  assert.deepEqual(before, ["210", "120"]);
  assert.match(await reveal.getAttribute("class"), /\bimage\b/);
  await page
    .getByRole("button", { name: "Replace source", exact: true })
    .click();
  await page
    .locator('input[accept="image/png,image/jpeg,image/webp,video/*,audio/*"]')
    .setInputFiles("docs/director-bundle/example/media/orbit-motion.mp4");
  await page.waitForFunction(() =>
    document
      .querySelector('.dir-clip[data-layer-id="shot-reveal"]')
      ?.classList.contains("video"),
  );
  await ready();
  assert.deepEqual(await timing(), before);
  console.log("PASS a video replaces a template plate and keeps its timing");

  await page.goto(`${base}/director?example=product-video&aspect=9:16`);
  await ready();
  assert.match(await meta(), /360 × 640/);
  console.log("PASS product video opens its 9:16 variant");
  await page.goto(`${base}/director?example=audio-visual&aspect=9:16`);
  await page
    .getByRole("alert")
    .filter({ hasText: "Audio-visual takes 16:9" })
    .waitFor();
  console.log("PASS a ratio the template does not offer is refused");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of Object.keys(expected)) {
    await page.goto(`${base}/director?example=${id}`);
    await ready();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${id}: wider than a phone`,
    );
  }
  await page.screenshot({ path: `${out}/template-phone.png`, fullPage: true });
  console.log("PASS every template fits a 390 px phone");
  assert.deepEqual(errors, []);
  console.log("PASS no browser runtime errors");
} finally {
  await browser.close();
}
