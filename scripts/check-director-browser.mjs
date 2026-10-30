// Start Vite first. Chrome is the default; set DIRECTOR_BROWSER=chromium for an installed Playwright browser.
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const out = ".local/director";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // /director opens a template in the simple Director; this check needs the
  // studio example's layers and the Editor's timeline.
  await page.goto(
    `${process.env.DIRECTOR_URL ?? "http://127.0.0.1:5175"}/director?example=studio&workspace=editor`,
  );
  const ready = () =>
    page
      .getByText("Ready · local preview", { exact: true })
      .waitFor({ timeout: 30000 });
  await ready();
  const pixels = () =>
    page
      .locator('canvas[aria-label="Director preview"]')
      .evaluate((c) =>
        Array.from(
          c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ),
      );
  const compare = (a, b, label) => {
    assert.equal(a.length, b.length);
    let sum = 0,
      large = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i]);
      sum += d;
      if (d > 8) large++;
    }
    const mean = sum / a.length,
      ratio = large / a.length;
    assert.ok(
      mean < 0.15 && ratio < 0.002,
      `${label}: mean=${mean}, channels differing >8=${ratio}`,
    );
    console.log(
      `PASS ${label}: mean channel difference=${mean.toFixed(5)}, >8 ratio=${ratio.toFixed(5)}`,
    );
  };
  const seek = async (f) => {
    await page
      .getByRole("slider", { name: "Playhead", exact: true })
      .fill(String(f));
    await page.waitForFunction(
      (f) =>
        document.querySelector('canvas[aria-label="Director preview"]').dataset
          .frame === String(f),
      f,
    );
  };
  await seek(75);
  const first = await pixels();
  await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
  await seek(140);
  await seek(75);
  compare(first, await pixels(), "random seek 75 → 140 → 75");
  assert.equal(await page.locator(".dir-frame-scale i").count(), 180);
  await page.locator(".dir-ruler").click({ position: { x: 3, y: 28 } });
  await page.waitForFunction(
    () =>
      document.querySelector('canvas[aria-label="Director preview"]').dataset
        .frame === "1",
  );
  console.log("PASS ruler seeks one frame and shows all 180 ticks");
  for (const f of [0, 75, 140, 179]) {
    await seek(f);
    const png = await page
      .locator('canvas[aria-label="Director preview"]')
      .evaluate((c) => c.toDataURL("image/png").split(",")[1]);
    await writeFile(`${out}/frame-${f}.png`, Buffer.from(png, "base64"));
  }
  await page.getByRole("button", { name: "Render MP4" }).click();
  await page.getByText(/Encoding frame /).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Cancel render" }).click();
  await page.getByText("Render stopped", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Download video with audio" }).count(),
    0,
  );
  console.log("PASS cancelled export offers no partial download");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.getByRole("button", { name: "Render MP4" }).click();
  await page
    .getByText("Render ready · MP4 with audio", { exact: true })
    .waitFor({ timeout: 120000 });
  const video = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download video with audio" }).click();
  await (await video).saveAs(`${out}/render.mp4`);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  console.log("PASS MP4 export downloaded under 4× CPU throttling");
  const short = JSON.parse(
    await readFile("docs/director-bundle/example/studio.json", "utf8"),
  );
  short.composition.fps = 24;
  short.composition.durationFrames = 37;
  short.layers = short.layers
    .filter((l) => l.startFrame < 37)
    .map((l) => ({
      ...l,
      durationFrames: Math.min(l.durationFrames, 37 - l.startFrame),
    }));
  const score = short.layers.find((l) => l.kind === "audio");
  Object.assign(score, {
    startFrame: 5,
    durationFrames: 20,
    sourceStartFrame: 12,
    gain: 0.5,
  });
  short.layers.unshift({
    ...score,
    id: "second-audio",
    name: "Second audio",
    startFrame: 12,
    durationFrames: 25,
    sourceStartFrame: 0,
    gain: 0.3,
  });
  await writeFile(`${out}/nonstandard.json`, JSON.stringify(short));
  await page
    .locator('.director input[accept=".zip,.json"]')
    .setInputFiles(`${out}/nonstandard.json`);
  await ready();
  await page.getByRole("button", { name: "Render MP4" }).click();
  await page
    .getByText("Render ready · MP4 with audio", { exact: true })
    .waitFor({ timeout: 120000 });
  const shortVideo = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download video with audio" }).click();
  await (await shortVideo).saveAs(`${out}/nonstandard.mp4`);
  console.log(
    "PASS 37-frame / 24 fps export with trimmed, offset and overlapping audio",
  );
  await page
    .locator('.director input[accept=".zip,.json"]')
    .setInputFiles("docs/director-bundle/example/studio.json");
  await ready();
  const zip = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download bundle" }).click();
  await (await zip).saveAs(`${out}/project.zip`);
  await page
    .locator('.director input[accept=".zip,.json"]')
    .setInputFiles(`${out}/project.zip`);
  await ready();
  await seek(75);
  compare(first, await pixels(), "ZIP reopen");
  await page
    .getByRole("button", { name: "Select Anime bars", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show inspector", exact: true })
    .click();
  assert.ok(await page.getByLabel("Start frame", { exact: true }).isDisabled());
  console.log("PASS locked layer");
  await page
    .getByRole("button", {
      name: "Select Signal / animated title",
      exact: true,
    })
    .click();
  const title = page.getByLabel("text", { exact: true });
  await title.fill("EDITED SIGNAL");
  await title.press("Tab");
  await ready();
  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save JSON", exact: true }).click();
  await (await json).saveAs(`${out}/edited.json`);
  await page
    .locator('.director input[accept=".zip,.json"]')
    .setInputFiles(`${out}/edited.json`);
  await ready();
  assert.equal(
    await page.getByLabel("text", { exact: true }).inputValue(),
    "EDITED SIGNAL",
  );
  console.log("PASS edited JSON reopen");
  await page
    .getByRole("button", { name: "Duplicate layer", exact: true })
    .click();
  await ready();
  assert.equal(
    await page
      .getByRole("button", {
        name: "Select Signal / animated title copy",
        exact: true,
      })
      .count(),
    1,
  );
  console.log("PASS duplicate");
  await seek(0);
  // Timing fields live behind the transport's Timing disclosure.
  await page.locator("details.dir-timing").evaluate((d) => (d.open = true));
  await page.getByLabel("Image duration frames", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Add layer", exact: true }).click();
  const addDialog = page.getByRole("dialog", {
    name: "Add track",
    exact: true,
  });
  await addDialog
    .locator('input[type="file"]')
    .setInputFiles([
      "docs/director-bundle/example/media/orbit-1.png",
      "docs/director-bundle/example/media/orbit-2.png",
    ]);
  await addDialog
    .getByRole("button", { name: "Add track", exact: true })
    .click();
  await page.getByText("12 layers · 7 assets", { exact: true }).waitFor();
  await ready();
  const mediaJson = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save JSON", exact: true }).click();
  await (await mediaJson).saveAs(`${out}/media-edits.json`);
  const edited = JSON.parse(await readFile(`${out}/media-edits.json`, "utf8"));
  const images = edited.layers.filter(
    (l) => l.name === "orbit-1.png" || l.name === "orbit-2.png",
  );
  assert.deepEqual(
    images.map((l) => [l.startFrame, l.durationFrames]),
    [
      [0, 6],
      [6, 6],
    ],
  );
  console.log("PASS six-frame sequential image import");
  await page
    .getByRole("button", { name: "Select Orbit / video plate", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show inspector", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Replace source", exact: true })
    .click();
  await page
    .locator('input[accept="image/png,image/jpeg,image/webp,video/*,audio/*"]')
    .setInputFiles("docs/director-bundle/example/media/orbit-motion.mp4");
  await page.getByText("12 layers · 8 assets", { exact: true }).waitFor();
  await ready();
  assert.equal(
    await page.getByLabel("Start frame", { exact: true }).inputValue(),
    "0",
  );
  assert.equal(
    await page.getByLabel("Duration frames", { exact: true }).inputValue(),
    "180",
  );
  console.log("PASS source replacement preserves timing");
  // Asset inspector: the selected clip's source card, its asset's card and a
  // freshly imported fixture all show a decoded poster and a duration.
  const source = page.locator(".dir-source");
  // Posters are lazy: they decode once the card scrolls into view.
  await source.scrollIntoViewIfNeeded();
  await source.locator('img[data-poster="video"]').nth(1).waitFor();
  assert.match(await source.innerText(), /In\s+f 0 · 0\.000 s/);
  assert.match(await source.innerText(), /Out\s+f 179 · 5\.967 s/);
  assert.equal(await page.locator(".dir-clip.is-source").count(), 1);
  const plateCard = page.locator(
    '.genobi-project-assets button[aria-current="true"]',
  );
  await plateCard.locator('img[data-poster="video"]').waitFor();
  assert.equal(
    await plateCard.locator(".dir-asset-duration").innerText(),
    "6.00 s",
  );
  console.log("PASS clip source in/out and the linked asset card");
  // Since #67 the Project tab of the asset rail opens the dialog: its
  // toolbar counts the files and Manage opens Project media.
  const manageMedia = page
    .locator("#assets-pane-project")
    .getByRole("button", { name: "Manage", exact: true });
  await manageMedia.click();
  const drawer = page.getByRole("dialog", { name: "Project media" });
  await drawer
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/native-audio.mp4");
  await page.getByText("12 layers · 9 assets", { exact: true }).waitFor();
  const card = drawer.locator(".dir-asset-card", { hasText: "native-audio" });
  const poster = card.locator('img[data-poster="video"]');
  await poster.waitFor();
  assert.equal(await card.locator(".dir-asset-duration").innerText(), "2.00 s");
  // The fixture is solid blue, so the poster is a decoded frame, not a blank.
  const [r, g, b] = await poster.evaluate(async (img) => {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(c.width >> 1, c.height >> 1, 1, 1).data);
  });
  assert.ok(b > r + 60 && b > g + 30, `poster pixel ${r},${g},${b}`);
  const box = await card.boundingBox();
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await manageMedia.click();
  assert.deepEqual(await card.boundingBox(), box);
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  console.log("PASS imported fixture card shows a poster and its duration");
  await seek(75);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/portrait.png`, fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  console.log("PASS portrait width");
  assert.deepEqual(errors, []);
  console.log("PASS no browser runtime errors");
} finally {
  await browser.close();
}
