import { chooseSelect } from "./lib/choose-select.mjs";
/** Local fixture check: examples, bundled characters, PNG kit and actual MP4. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { unzipSync, strFromU8 } from "fflate";
import { Input, BufferSource, MP4 } from "mediabunny";
import { overflow, names } from "./lib/a11y-audit.mjs";
const base = process.env.STUDIO_URL ?? "http://127.0.0.1:5401";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".local/scene-examples";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ids = [
  "cathedral",
  "house-interior",
  "exploded-house",
  "neo-tokyo-street",
  "mountains",
  "forest",
  "forest-meeting",
  "forest-companion",
  "city-meeting",
];
const checks = [];
async function download(page, trigger) {
  const [file] = await Promise.all([page.waitForEvent("download"), trigger()]);
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks);
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(() =>
      localStorage.setItem("genobi-setup-seen-v1", "1"),
    );
    const writes = [],
      errors = [];
    await context.route("**/api/**", (route) => {
      if (route.request().method() !== "GET") {
        writes.push(route.request().url());
        return route.abort();
      }
      return route.fulfill({
        json: { hasServerKey: false, jobs: [], sources: [] },
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/?workspace=world`);
    await page
      .getByRole("navigation", { name: "Studio presets" })
      .getByRole("button", { name: "3D", exact: true })
      .click();
    const picker = page.getByLabel("Scene", { exact: true });
    const render = page.getByRole("button", {
      name: "Render playblast",
      exact: true,
    });
    const canvas = page.getByRole("img", { name: /^3D camera scene:/ });
    for (const id of width === 1440
      ? ids
      : ["forest-meeting", "city-meeting"]) {
      await chooseSelect(picker, id);
      await render.waitFor();
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll("button")].find(
            (b) => b.textContent.trim() === "Render playblast",
          )?.disabled,
      );
      await canvas.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${output}/${id}-${width}.png`,
        fullPage: true,
      });
      if (id === "forest-companion")
        await canvas.screenshot({
          path: `${output}/mannequin-dog-${width}.png`,
        });
      assert.deepEqual(await overflow(page), []);
    }
    await chooseSelect(picker, "forest-meeting");
    const archetype = page.getByLabel("Subject", { exact: true });
    for (const profile of ["mannequin", "pug", "blob"]) {
      await chooseSelect(archetype, profile);
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll("button")].find(
            (b) => b.textContent.trim() === "Render playblast",
          )?.disabled,
      );
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await canvas.screenshot({ path: `${output}/${profile}-${width}.png` });
      if (profile === "pug") {
        const dogKit = page.getByRole("button", {
          name: "Export LTX + AKUSPACE kit",
          exact: true,
        });
        const dogZip = unzipSync(await download(page, () => dogKit.click()));
        const dogScene = JSON.parse(strFromU8(dogZip["scene.json"]));
        assert(dogScene.characters.every((c) => c.asset === "pug"));
        assert.match(strFromU8(dogZip["README.md"]), /Pug by Quaternius/);
        const plan = JSON.parse(strFromU8(dogZip["plan.json"]));
        await writeFile(
          `${output}/pug-first-frame-${width}.png`,
          dogZip[plan.firstFrame],
        );
      }
      assert.equal(await page.getByRole("alert").count(), 0);
      assert.deepEqual(await overflow(page), []);
    }
    await chooseSelect(archetype, "mannequin");
    await page.getByText("Cast credits", { exact: true }).click();
    const credits = await download(page, () =>
      page
        .getByRole("button", { name: "Download cast credits", exact: true })
        .click(),
    );
    assert.match(credits.toString(), /Holodeck/);
    assert.match(credits.toString(), /CC0/);
    await chooseSelect(archetype, "saved");
    const exportKit = page.getByRole("button", {
      name: "Export LTX + AKUSPACE kit",
      exact: true,
    });
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].find((b) =>
          b.textContent.includes("Export LTX + AKUSPACE kit"),
        )?.disabled,
    );
    for (const control of [picker, archetype, render, exportKit]) {
      const box = await control.boundingBox();
      assert(
        box.width >= 24 && box.height >= 24,
        "3D controls need usable targets",
      );
    }
    const zip = unzipSync(await download(page, () => exportKit.click()));
    const plan = JSON.parse(strFromU8(zip["plan.json"]));
    const scene = JSON.parse(strFromU8(zip["scene.json"]));
    const graph = JSON.parse(strFromU8(zip["workflow.json"]));
    const path = JSON.parse(strFromU8(zip["camera-path.json"]));
    assert.equal(scene.characters.length, 2);
    assert.equal(plan.submitted, false);
    assert.equal(plan.conditioning, "first-frame-image");
    assert.equal(plan.cameraConditioning, "prompt-only");
    assert.equal(graph["90"].inputs.image, plan.firstFrame);
    assert.equal(graph["2"].inputs.strength_model, 1);
    assert(
      !zip[plan.referenceAudio],
      "A missing dry recording must not be fabricated",
    );
    assert.match(strFromU8(zip["README.md"]), /dry recording is not included/);
    const png = Buffer.from(zip[plan.firstFrame]);
    assert.equal(png.readUInt32BE(16), 1280);
    assert.equal(png.readUInt32BE(20), 704);
    const colors = await page.evaluate(
      async (bytes) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 70;
        const c = canvas.getContext("2d");
        c.drawImage(bitmap, 0, 0, 128, 70);
        bitmap.close();
        const pixels = c.getImageData(0, 0, 128, 70).data;
        const unique = new Set();
        for (let i = 0; i < pixels.length; i += 4)
          unique.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
        return unique.size;
      },
      [...png],
    );
    assert(colors > 100, `Capture appears blank: ${colors} colours`);
    await writeFile(`${output}/first-frame-${width}.png`, png);
    assert.equal(path.keys.length, plan.frames);
    assert.deepEqual(await names(page), []);

    if (width === 1440) {
      await page.getByText("Settings · length & size", { exact: true }).click();
      await chooseSelect(page.getByLabel("Length", { exact: true }), "2");
      // Render the mixed scene, verifying both rigs survive actual MP4 capture.
      await chooseSelect(picker, "forest-companion");
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll("button")].find(
            (b) => b.textContent.trim() === "Render playblast",
          )?.disabled,
      );
      await render.click();
      const link = page.getByRole("link", {
        name: "Download MP4",
        exact: true,
      });
      await link.waitFor({ timeout: 120000 });
      const clip = await download(page, () => link.click());
      const input = new Input({
        source: new BufferSource(clip),
        formats: [MP4],
      });
      const track = await input.getPrimaryVideoTrack();
      assert.equal(track.displayWidth, 1280);
      assert.equal(track.displayHeight, 704);
      const duration = await input.computeDuration();
      assert(Math.abs(duration - 49 / 24) < 0.05);
      input.dispose();
      await writeFile(`${output}/forest-companion.mp4`, clip);
    }
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    checks.push({
      width,
      examples: width === 1440 ? ids.length : 2,
      subjects: 3,
      kit: true,
      pngColors: colors,
      noGeneration: true,
      mp4: width === 1440,
    });
    await context.close();
  }
  // A failed character fetch must block capture and offer a working retry.
  const recovery = await browser.newContext({ reducedMotion: "reduce" });
  await recovery.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  await recovery.route("**/api/**", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { hasServerKey: false, jobs: [], sources: [] } })
      : route.abort(),
  );
  const page = await recovery.newPage();
  await page.goto(`${base}/?workspace=world`);
  await page
    .getByRole("navigation", { name: "Studio presets" })
    .getByRole("button", { name: "3D", exact: true })
    .click();
  const render = page.getByRole("button", {
    name: "Render playblast",
    exact: true,
  });
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Render playblast",
      )?.disabled,
  );
  let blocked = true;
  await recovery.route("**/world-assets/AnimationLibrary.glb", (route) =>
    blocked ? route.abort() : route.continue(),
  );
  await chooseSelect(
    page.getByLabel("Scene", { exact: true }),
    "forest-meeting",
  );
  await page
    .getByRole("button", { name: "Retry scene", exact: true })
    .waitFor();
  assert.equal(await render.isDisabled(), true);
  blocked = false;
  await page.getByRole("button", { name: "Retry scene", exact: true }).click();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Render playblast",
      )?.disabled,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Retry scene", exact: true })
      .count(),
    0,
  );
  checks.push({ failedAssetBlocksCapture: true, retryRecovers: true });
  await recovery.close();
  await writeFile(`${output}/report.json`, JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
