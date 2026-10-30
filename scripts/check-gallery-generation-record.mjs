/**
 * The Character piece card (Forest guardian) opens filled in, in a browser
 * against the local studio:
 *   DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-gallery-generation-record.mjs
 * At 1440 and 390 px wide: opening the card shows the owner's start image as
 * the Start image example, the prompt word for word, 21:9, 20 s and FLUX 3 ·
 * HD; the card's clip in the drawer has controls and is not muted, and the
 * gallery card's own preview stays muted. The first-run guide is marked seen
 * before load. Nothing is quoted or generated: Generate is never pressed,
 * and any quote or job request is refused and counted.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local studio",
);
const output =
  process.env.STUDIO_EVIDENCE ?? ".local/gallery-generation-record";
await mkdir(output, { recursive: true });
const START = "/media/template-gallery/character-piece-start.webp";
const PROMPT_START = "animate the character make it train ninja moves";
const PROMPT_END = "Keep aesthethics as on the image1.";
const browser = await chromium.launch({ headless: true });
let paid = 0;
const errors = [];

for (const width of [1440, 390]) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.addInitScript(() =>
    localStorage.setItem("genobi.startup-guide.v1", "seen"),
  );
  page.on("pageerror", (e) => errors.push(`${width}: ${e.message}`));
  await page.route(/\/api\/(quotes|jobs)$/, (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    paid++;
    return route.abort();
  });
  await page.goto(`${base}/`);
  const card = page.getByRole("button", { name: "View Forest guardian" });
  await card.scrollIntoViewIfNeeded();
  const cardVideo = page
    .locator(".template-card", { has: card })
    .locator("video");
  if (await cardVideo.count())
    assert.equal(await cardVideo.evaluate((v) => v.muted), true);
  await card.click();
  const drawer = page.locator(".template-drawer");
  await drawer.waitFor();
  const prompt = await drawer.locator("textarea.template-prompt").inputValue();
  assert(prompt.startsWith(PROMPT_START), `${width}: prompt ${prompt}`);
  assert(prompt.endsWith(PROMPT_END), `${width}: prompt end`);
  assert(!/duration|aspect_ratio/.test(prompt), `${width}: settings in prompt`);
  const selects = drawer.locator(".template-controls select");
  assert.equal(await selects.nth(0).inputValue(), "21:9");
  assert.equal(await selects.nth(1).inputValue(), "20");
  assert.match(
    await drawer.locator(".template-model").textContent(),
    /FLUX 3 · HD/,
  );
  const start = drawer.locator('[data-reference="start"]');
  assert.equal(await start.getAttribute("data-state"), "example");
  const thumb = start.locator("img");
  assert.equal(await thumb.getAttribute("src"), START);
  await thumb.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (img) => img.complete && img.naturalWidth > 0,
    await thumb.elementHandle(),
  );
  assert.equal(
    await thumb.evaluate((img) => img.naturalWidth),
    1918,
    `${width}: the start image decodes at full size`,
  );
  const clip = drawer.locator(".template-output-frame video");
  const sound = await clip.evaluate((v) => ({
    controls: v.controls,
    muted: v.muted,
    autoplay: v.autoplay,
  }));
  assert.deepEqual(sound, { controls: true, muted: false, autoplay: false });
  assert.match(
    await drawer.textContent(),
    /Made from this start image and prompt with FLUX 3 image to video\./,
  );
  await page.screenshot({ path: `${output}/drawer-${width}.png` });
  await page.close();
}

await browser.close();
assert.deepEqual(errors, []);
assert.equal(paid, 0, "no quote or job request was sent");
console.log("Forest guardian opens filled in at 1440 and 390; nothing quoted.");
