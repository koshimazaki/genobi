import { chooseSelect } from "./lib/choose-select.mjs";
/**
 * The 3D section's camera plates, radar and playblast, against a local Vite
 * server: STUDIO_URL=http://127.0.0.1:4317 node scripts/check-3d-tab.mjs
 *
 * Every API route is a fixture and every non-GET request is aborted, so no
 * generation, upload or key check leaves the browser. The playblast renders
 * and encodes in the page; WebCodecs needs Chrome (DIRECTOR_BROWSER=chrome).
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BufferSource, Input, MP4 } from "mediabunny";
import { chromium } from "playwright";
import { movingCanvases, overflow } from "./lib/a11y-audit.mjs";
import {
  boxes,
  download,
  open as openPage,
  packets,
  radarInk,
  same,
  sceneCanvas,
  section,
  timeShown,
} from "./lib/scene3d-check.mjs";
import { panelChecks } from "./lib/scene3d-panel-checks.mjs";

const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = process.env.STUDIO_EVIDENCE ?? ".local/check-3d-tab";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
const checks = [];
const pass = (text) => {
  checks.push(text);
  console.log(`PASS ${text}`);
};

const open = (viewport, reducedMotion) =>
  openPage(browser, viewport, reducedMotion);

// Desktop: plates, radar, playblast into the Director, nothing moves.
{
  const { context, page, errors } = await open({ width: 1440, height: 1000 });
  try {
    // Gallery is the first view; Camera is the baseline here.
    await page.goto(`${base}/?workspace=camera`);
    await page.getByRole("button", { name: "Generate", exact: true }).waitFor();
    await page.waitForTimeout(800);
    const camera = [
      ".composer-toolbar",
      ".genobi-panel-gallery",
      ".genobi-modebar",
    ];
    const cameraBefore = await boxes(page, camera);

    await section(page, "3D");
    await sceneCanvas(page).waitFor();
    await page.getByLabel("World Builder scene", { exact: true }).waitFor();
    await page.waitForTimeout(1500);
    const shell = [
      ".genobi-modebar",
      '[data-panel="plates"]',
      '[data-panel="world"]',
      '[data-panel="project"]',
      '[data-panel="inspirations"]',
    ];
    const shellBefore = await boxes(page, shell);
    assert.equal(
      await page.locator("[data-plate]").count(),
      10,
      "ten camera plates",
    );
    pass("3D section shows the 3D camera panel with ten plates");

    const first = await radarInk(page, "Top view of the camera path");
    assert(first.ink > 500, "top radar drew");
    const firstScene = await sceneCanvas(page).screenshot();
    await page.locator('[data-plate="half-orbit"]').click();
    assert.equal(
      await page
        .locator('[data-plate="half-orbit"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.waitForTimeout(5600);
    const second = await radarInk(page, "Top view of the camera path");
    const side = await radarInk(page, "Side view of the camera height");
    assert(second.ink > 500 && side.ink > 500, "both radar views drew");
    assert.notEqual(second.hash, first.hash, "radar redrew for the new plate");
    assert(
      !(await sceneCanvas(page).screenshot()).equals(firstScene),
      "scene moved",
    );
    same(
      shellBefore,
      await boxes(page, shell),
      "after picking and playing a plate",
    );
    pass(
      "Picking a plate plays it, redraws both radar views and keeps the layout",
    );

    // A pick during playback starts a new session from zero.
    await page.locator('[data-plate="pull-out"]').click();
    await page.waitForTimeout(1800);
    assert((await timeShown(page)) > 1.2, "first plate is playing");
    await page.locator('[data-plate="crane-up"]').click();
    await page.waitForTimeout(150);
    const restarted = await timeShown(page);
    assert(
      restarted < 0.6,
      `new plate restarted from zero, not ${restarted} s`,
    );
    await page.waitForTimeout(400);
    assert((await timeShown(page)) > restarted, "and keeps playing");
    pass("Picking a plate during playback restarts it from zero");
    await page.waitForTimeout(5200);

    await page.getByRole("button", { name: "Smooth curve" }).click();
    await page.getByRole("button", { name: "Tilt up", exact: false }).click();
    await page.getByRole("button", { name: /^Turntable/ }).click();
    await page.locator('[data-plate="spiral-rise"]').click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".s3d-stack li").count(), 3);
    same(
      shellBefore,
      await boxes(page, shell),
      "after a combo, curve and gestures",
    );
    pass(
      "Combo, curve and gestures keep the layout; the stack keeps three rows",
    );

    await page.locator('[data-plate="half-orbit"]').click();
    await chooseSelect(page.getByLabel("Length"), "2");
    await page.getByRole("button", { name: "Render playblast" }).click();
    await page.getByText(/Rendering frame \d+ of 49/).waitFor();
    same(shellBefore, await boxes(page, shell), "while rendering");
    await page
      .getByText(/Saved “Playblast · Half orbit” to the Director/)
      .waitFor({
        timeout: 120_000,
      });
    same(shellBefore, await boxes(page, shell), "after the playblast saved");
    await page.screenshot({ path: `${output}/desktop-3d.png`, fullPage: true });
    pass("A 2 s playblast renders and saves without moving the layout");

    const [video] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download MP4" }).click(),
    ]);
    const bytes = new Uint8Array(await readFile(await video.path()));
    await writeFile(`${output}/playblast.mp4`, bytes);
    const input = new Input({
      source: new BufferSource(bytes),
      formats: [MP4],
    });
    const track = await input.getPrimaryVideoTrack();
    assert(track, "MP4 has a video track");
    assert.equal(track.displayWidth, 1280);
    assert.equal(track.displayHeight, 704);
    const stats = await track.computePacketStats();
    assert.equal(stats.packetCount, 49, "49 frames");
    const tags = await input.getMetadataTags();
    const receipt = JSON.parse(tags.comment);
    input.dispose();
    assert.equal(receipt.format, "genobi.playblast");
    assert.equal(receipt.plate, "half-orbit");
    assert.deepEqual(receipt.gestures, ["tilt-up", "turntable"]);
    assert.equal(receipt.ease, "smoothstep");
    assert.equal(receipt.frames, 49);
    assert.equal(receipt.cameraPath.version, 1);
    assert.equal(receipt.cameraPath.keys.length, 49);
    assert(Math.abs(receipt.cameraPath.duration - 2) < 1e-9);
    const [pathFile] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Camera path JSON" }).click(),
    ]);
    assert.deepEqual(
      JSON.parse(await readFile(await pathFile.path(), "utf8")),
      receipt.cameraPath,
    );
    pass(
      `MP4 (${track.codec}) carries 49 frames and its receipt with the shared camera path`,
    );

    // Switching scene and theme mid-render must not reach the clip: the same
    // plate rendered again, disturbed half way, encodes the same frames.
    const undisturbed = await packets(bytes);
    await page.getByRole("button", { name: "Render playblast" }).click();
    // Switch inside the page the moment frame 5 renders, so it lands mid-clip.
    const switchedAt = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const status = document.querySelector(".s3d-status");
          const look = () => {
            const n = Number(
              status.textContent.match(/Rendering frame (\d+)/)?.[1],
            );
            if (n < 5) return false;
            const select = document.querySelector(".s3d-scene-picker select");
            Object.getOwnPropertyDescriptor(
              HTMLSelectElement.prototype,
              "value",
            ).set.call(select, "acoustic-room");
            select.dispatchEvent(new Event("change", { bubbles: true }));
            document.documentElement.setAttribute("data-theme", "cyberpunk");
            resolve(n);
            return true;
          };
          if (!look())
            new MutationObserver((_, o) => look() && o.disconnect()).observe(
              status,
              { childList: true, subtree: true, characterData: true },
            );
        }),
    );
    await page.waitForTimeout(50);
    assert.equal(
      await page.locator(".s3d-scene-picker select").inputValue(),
      "acoustic-room",
    );
    assert(switchedAt < 45, `switched at frame ${switchedAt} of 49`);
    await page
      .getByText(/Saved “Playblast · Half orbit” to the Director/)
      .waitFor({ timeout: 120_000 });
    const disturbedBytes = await download(page, "Download MP4");
    const disturbed = await packets(disturbedBytes);
    const disturbedInput = new Input({
      source: new BufferSource(disturbedBytes),
      formats: [MP4],
    });
    const disturbedReceipt = JSON.parse(
      (await disturbedInput.getMetadataTags()).comment,
    );
    disturbedInput.dispose();
    assert.equal(disturbedReceipt.scene, "set");
    assert.equal(disturbed.length, undisturbed.length);
    disturbed.forEach((p, i) =>
      assert(p.equals(undisturbed[i]), `frame ${i} changed after the switch`),
    );
    await page.evaluate(() =>
      document.documentElement.removeAttribute("data-theme"),
    );
    await chooseSelect(page.locator(".s3d-scene-picker select"), "set");
    pass(
      "A scene and theme switch mid-render leaves the clip and receipt unchanged",
    );

    // Cancel during a render: back to idle, nothing new in the Director.
    await page.getByRole("button", { name: "Render playblast" }).click();
    await page.getByText(/Rendering frame \d+ of 49/).waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByText(/Renders the plate on this scene/).waitFor();

    await section(page, "Editor");
    const tracks = page.getByRole("button", {
      name: "Select track Playblast · Half orbit",
    });
    await tracks.first().waitFor();
    assert.equal(
      await tracks.count(),
      2,
      "two saved, the cancelled one absent",
    );
    pass("Saved playblasts are Director tracks; the cancelled one is not");

    await section(page, "Camera");
    await page.waitForTimeout(1000);
    same(cameraBefore, await boxes(page, camera), "on returning to Camera");
    pass("Camera toolbar and gallery are where they were");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

// Phone, reduced motion: a still frame, nothing moving on its own.
{
  const { context, page, errors } = await open(
    { width: 390, height: 844 },
    "reduce",
  );
  try {
    await page.goto(`${base}/?workspace=world`);
    await sceneCanvas(page).waitFor();
    await page.waitForTimeout(1500);
    const before = await sceneCanvas(page).screenshot();
    await page.locator('[data-plate="crane-up"]').click();
    await page.waitForTimeout(300);
    assert.equal(
      await page
        .getByRole("button", { name: "Play", exact: true })
        .getAttribute("aria-pressed"),
      "false",
      "no autoplay under reduced motion",
    );
    const still = await sceneCanvas(page).screenshot();
    assert(!still.equals(before), "the new plate's first frame is drawn");
    const ink = await radarInk(page, "Top view of the camera path");
    assert(ink.ink > 300, "radar drew under reduced motion");
    const moving = await movingCanvases(page);
    assert.deepEqual(moving, []);
    assert.deepEqual(await overflow(page), []);
    await page.locator('[data-panel="plates"]').screenshot({
      path: `${output}/phone-reduced.png`,
    });
    assert.deepEqual(errors, []);
    pass(
      "Phone with reduced motion: still frame, radar drawn, nothing moving, no overflow",
    );
  } finally {
    await context.close();
  }
}

// Ninja latch, a four-column Ninja column at 1150 px, and a lost context.
await panelChecks({ open, base, pass, output });

// Other breakpoints: no overflow, and picking each of the ten plates keeps the
// shell in place (reduced motion, so nothing plays between measurements).
for (const width of [1280, 768, 320]) {
  const { context, page, errors } = await open(
    { width, height: 900 },
    "reduce",
  );
  try {
    await page.goto(`${base}/?workspace=world`);
    await sceneCanvas(page).waitFor();
    await page.getByLabel("World Builder scene", { exact: true }).waitFor();
    await page.waitForTimeout(1500);
    const shell = [
      ".genobi-modebar",
      '[data-panel="plates"]',
      '[data-panel="world"]',
      '[data-panel="project"]',
      '[data-panel="inspirations"]',
    ];
    const before = await boxes(page, shell);
    const plates = await page
      .locator("[data-plate]")
      .evaluateAll((els) => els.map((e) => e.dataset.plate));
    assert.equal(plates.length, 10);
    for (const plate of plates) {
      await page.locator(`[data-plate="${plate}"]`).click();
      await page.waitForTimeout(200);
      same(before, await boxes(page, shell), `at ${width}px after ${plate}`);
    }
    assert.deepEqual(await overflow(page), [], `overflow at ${width}px`);
    await page.locator('[data-panel="plates"]').screenshot({
      path: `${output}/panel-${width}.png`,
    });
    assert.deepEqual(errors, []);
    pass(`${width} px: all ten plates keep the shell in place, no overflow`);
  } finally {
    await context.close();
  }
}

await browser.close();
await writeFile(`${output}/report.json`, JSON.stringify({ checks }, null, 2));
console.log(`${checks.length} checks passed; evidence in ${output}`);
