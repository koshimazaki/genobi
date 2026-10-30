// Project media previews in a real browser: hover playback in the rail, one
// sound at a time, the drawer's double-click lightbox with focus returned,
// reduced motion and the phone layout. Start the local server first
// (`npm run dev`); DIRECTOR_URL overrides the address. Nothing is generated.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
const out = process.env.STUDIO_EVIDENCE ?? ".local/media-preview";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const errors = [];

async function open(viewport, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  // The first-run setup guide would cover the Director.
  await context.addInitScript(() => {
    localStorage.setItem("genobi-setup-seen-v1", "1");
    localStorage.setItem("genobi.startup-guide.v1", "seen");
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/director?example=studio&workspace=editor`);
  await page
    .getByText("Ready · local preview", { exact: true })
    .waitFor({ timeout: 30000 });
  const rail = page.locator("#assets-pane-project");
  if (!(await rail.isVisible())) {
    await page.locator(".studio-assets-toggle").click();
    await page.locator("#assets-tab-project").click();
  }
  return { page, rail };
}
const playing = (media) =>
  media.evaluate(
    (m) =>
      new Promise((done) => {
        const check = () =>
          !m.paused && m.currentTime > 0 ? done(true) : setTimeout(check, 50);
        check();
      }),
  );

try {
  const { page, rail } = await open({ width: 1440, height: 1050 });
  const videoTile = rail.locator('.media-tile[data-kind="video"]').first();
  await videoTile.scrollIntoViewIfNeeded();
  assert.equal(await videoTile.locator("video").count(), 0, "nothing loaded");
  await videoTile.hover();
  const hoverVideo = videoTile.locator("video.media-tile-video");
  await hoverVideo.waitFor();
  assert.ok(await playing(hoverVideo));
  assert.equal(await hoverVideo.evaluate((v) => v.muted), true);
  await page.screenshot({ path: `${out}/1440-rail-hover.png` });
  await page.mouse.move(5, 5);
  await hoverVideo.waitFor({ state: "detached" });
  console.log("PASS rail video plays muted on hover and stops on leave");

  const audioTile = rail.locator('.media-tile[data-kind="audio"]').first();
  await audioTile.getByRole("button", { name: /^Play / }).click();
  const sound = audioTile.locator("audio");
  assert.ok(await playing(sound));
  await audioTile.locator(".media-tile-progress").waitFor();
  // A video preview starting stops the sound.
  await videoTile.hover();
  await hoverVideo.waitFor();
  await sound.waitFor({ state: "detached" });
  await page.mouse.move(5, 5);
  console.log("PASS rail audio plays, and stops when another preview starts");
  // A hidden tab keeps its cards mounted; changing tab stops the sound.
  await audioTile.getByRole("button", { name: /^Play / }).click();
  assert.ok(await playing(sound));
  await page.locator("#assets-tab-inspirations").click();
  await sound.waitFor({ state: "detached" });
  await page.locator("#assets-tab-project").click();
  console.log("PASS changing the rail's tab stops its preview");

  await rail.getByRole("button", { name: "Manage", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Project media" });
  const card = drawer.locator('.media-tile[data-kind="video"] .dir-asset-card');
  await card.first().waitFor();
  await page.screenshot({ path: `${out}/1440-drawer.png` });
  await card.first().click();
  assert.equal(await card.first().getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("dialog.media-lightbox").count(), 0);
  await card.first().dblclick();
  const lightbox = page.locator("dialog.media-lightbox");
  await lightbox.waitFor();
  const big = lightbox.locator("video");
  assert.deepEqual(
    await big.evaluate((v) => [v.controls, v.muted, v.paused]),
    [true, false, true],
    "controls and sound, not playing on its own",
  );
  const box = await lightbox.boundingBox();
  assert.ok(box.width <= 1440 * 0.7 + 1, `lightbox ${box.width} px wide`);
  await page.screenshot({ path: `${out}/1440-lightbox.png` });
  await page.keyboard.press("Escape");
  await lightbox.waitFor({ state: "detached" });
  assert.ok(await drawer.isVisible(), "the drawer stays open");
  assert.ok(
    await card.first().evaluate((c) => document.activeElement === c),
    "focus returns to the card",
  );
  console.log("PASS drawer double-click lightbox, Escape and focus return");
  await page.close();

  const reduced = await open(
    { width: 1440, height: 1050 },
    { reducedMotion: "reduce" },
  );
  const still = reduced.rail.locator('.media-tile[data-kind="video"]').first();
  await still.hover();
  await reduced.page.waitForTimeout(400);
  assert.equal(await still.locator("video").count(), 0);
  await still.getByRole("button", { name: /^Play / }).click();
  assert.ok(await playing(still.locator("video")));
  console.log("PASS reduced motion: no hover playback, a play button instead");
  await reduced.page.close();

  const phone = await open(
    { width: 390, height: 844 },
    { hasTouch: true, isMobile: true },
  );
  await phone.page.screenshot({ path: `${out}/390-rail.png` });
  await phone.rail.getByRole("button", { name: "Manage", exact: true }).click();
  const phoneDrawer = phone.page.getByRole("dialog", { name: "Project media" });
  await phoneDrawer.locator(".dir-asset-card").first().waitFor();
  await phone.page.screenshot({ path: `${out}/390-drawer.png` });
  await phoneDrawer
    .locator('.media-tile[data-kind="image"]')
    .first()
    .getByRole("button", { name: /^Preview / })
    .click();
  const phoneBox = phone.page.locator("dialog.media-lightbox");
  await phoneBox.locator("img").waitFor();
  const w = (await phoneBox.boundingBox()).width;
  assert.ok(w <= 390, `phone lightbox ${w} px wide`);
  await phone.page.screenshot({ path: `${out}/390-lightbox.png` });
  await phone.page.keyboard.press("Escape");
  await phoneBox.waitFor({ state: "detached" });
  assert.ok(
    await phone.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  console.log("PASS phone drawer and lightbox fit 390 px");
  assert.deepEqual(errors, []);
  console.log("PASS no browser runtime errors");
} finally {
  await browser.close();
}
