import { chooseSelect } from "./lib/choose-select.mjs";
/** Private fixture smoke check. CREATURE_VRM_PATH and CREATURE_FBX_PATH stay local. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { strFromU8, unzipSync } from "fflate";
import { BufferSource, Input, MP4 } from "mediabunny";
import { overflow } from "./lib/a11y-audit.mjs";
const model = process.env.CREATURE_VRM_PATH;
const motion = process.env.CREATURE_FBX_PATH;
assert(
  model && motion,
  "Set CREATURE_VRM_PATH and CREATURE_FBX_PATH (Mixamo Idle FBX).",
);
const base = process.env.STUDIO_URL ?? "http://127.0.0.1:5401";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const output = ".local/creature";
await mkdir(output, { recursive: true });
async function download(page, click) {
  const [file] = await Promise.all([page.waitForEvent("download"), click()]);
  const buffers = [];
  for await (const b of await file.createReadStream()) buffers.push(b);
  return Buffer.concat(buffers);
}
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [],
      writes = [],
      external = [];
    await context.addInitScript(() =>
      localStorage.setItem("genobi-setup-seen-v1", "1"),
    );
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
        external.push(url.origin);
        return route.abort();
      }
      if (url.pathname.startsWith("/api/")) {
        if (request.method() !== "GET") {
          writes.push(url.pathname);
          return route.abort();
        }
        return route.fulfill({
          json: { hasServerKey: false, jobs: [], sources: [] },
        });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/?workspace=world`);
    await page
      .getByRole("navigation", { name: "Studio presets" })
      .getByRole("button", { name: "3D", exact: true })
      .click();
    await chooseSelect(
      page.getByLabel("Scene", { exact: true }),
      "forest-meeting",
    );
    await chooseSelect(page.getByLabel("Subject", { exact: true }), "creature");
    await page
      .getByRole("alert")
      .filter({ hasText: "Load the local Creature VRM" })
      .waitFor();
    const render = page.getByRole("button", {
      name: "Render playblast",
      exact: true,
    });
    assert(await render.isDisabled(), "Missing model must block capture");
    await page.getByText("Creature model & motion", { exact: true }).click();
    await page
      .getByLabel("Load creature VRM · this tab only")
      .setInputFiles(model);
    await page
      .getByText("Creature ready · original materials", { exact: false })
      .waitFor({ timeout: 60000 });
    const ready = () =>
      page.waitForFunction(
        () =>
          !Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent.trim() === "Render playblast",
          )?.disabled,
      );
    await ready();
    const canvas = page.getByRole("img", { name: /^3D camera scene:/ });
    await canvas.screenshot({ path: `${output}/creature-${width}.png` });
    await page.getByLabel("Assign FBX animation").setInputFiles(motion);
    await page.getByText("idle assigned", { exact: true }).waitFor();
    await ready();
    await page.getByLabel("Plate time", { exact: true }).fill("0.3");
    await canvas.screenshot({ path: `${output}/creature-fbx-${width}.png` });
    const zip = unzipSync(
      await download(page, () =>
        page
          .getByRole("button", {
            name: "Export LTX + AKUSPACE kit",
            exact: true,
          })
          .click(),
      ),
    );
    const receipt = JSON.parse(strFromU8(zip["creature.json"]));
    assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
    assert.match(receipt.motions.idle.sha256, /^[a-f0-9]{64}$/);
    assert.equal(receipt.modelIncluded, false);
    assert.equal(receipt.animationFilesIncluded, false);
    assert(!Object.keys(zip).some((n) => /\.(vrm|fbx)$/i.test(n)));
    const plan = JSON.parse(strFromU8(zip["plan.json"]));
    const png = Buffer.from(zip[plan.firstFrame]);
    assert.equal(png.readUInt32BE(16), 1280);
    assert.equal(png.readUInt32BE(20), 704);
    await writeFile(`${output}/first-frame-${width}.png`, png);
    // Import a mixed cast: one mannequin and one creature, independently posed.
    const scene = JSON.parse(strFromU8(zip["scene.json"]));
    scene.characters[0].asset = "mannequin";
    scene.characters[0].pose = "talk";
    await page.getByLabel("Scene file", { exact: true }).setInputFiles({
      name: "mixed.scene.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(scene)),
    });
    await ready();
    await canvas.screenshot({ path: `${output}/mixed-${width}.png` });
    assert.deepEqual(await overflow(page), []);
    if (width === 1440) {
      await page.getByText("Settings · length & size", { exact: true }).click();
      await chooseSelect(page.getByLabel("Length", { exact: true }), "2");
      await render.click();
      const link = page.getByRole("link", {
        name: "Download MP4",
        exact: true,
      });
      try {
        await link.waitFor({ timeout: 120000 });
      } catch (error) {
        console.log(await page.locator("body").innerText());
        throw error;
      }
      const bytes = await download(page, () => link.click());
      const input = new Input({
        source: new BufferSource(bytes),
        formats: [MP4],
      });
      const track = await input.getPrimaryVideoTrack();
      assert.equal(track.displayWidth, 1280);
      assert.equal(track.displayHeight, 704);
      assert(Math.abs((await input.computeDuration()) - 49 / 24) < 0.05);
      input.dispose();
      await writeFile(`${output}/mixed.mp4`, bytes);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    assert.deepEqual(external, []);
    report.push({
      width,
      localVrm: true,
      fbxAssigned: true,
      mixedCast: true,
      kit: true,
      noNetworkWrites: true,
      mp4: width === 1440,
    });
    await context.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
