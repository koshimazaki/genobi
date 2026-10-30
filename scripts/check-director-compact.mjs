import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5175";
// /director opens a template in the simple Director; these checks need the
// studio example's layers and the Editor's timeline.
const editor = `${base}/director?example=studio&workspace=editor`;
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function ready() {
  await page.getByText("Ready · local preview", { exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) =>
        button.textContent.startsWith("Render MP4") && !button.disabled,
    ),
  );
}
const clip = (name) =>
  page.getByRole("button", { name: `Select ${name}`, exact: true });
async function drop(locator, path, type) {
  const bytes = (await readFile(path)).toString("base64");
  await locator.evaluate(
    (element, { bytes, name, type }) => {
      const data = new DataTransfer();
      data.items.add(
        new File([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], name, {
          type,
        }),
      );
      element.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        }),
      );
    },
    { bytes, name: path.split("/").at(-1), type },
  );
}
async function save(name) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save JSON", exact: true }).click();
  const file = `.local/director/${name}.json`;
  await (await download).saveAs(file);
  return JSON.parse(await readFile(file, "utf8"));
}
try {
  await mkdir(".local/director", { recursive: true });
  // Director's panels render in the studio shell's grid, so the timeline
  // spans the Camera preset's grid and the console keeps the studio's type.
  await page.goto(`${base}/?workspace=camera`);
  const reference = await page.evaluate(() => ({
    width: document.querySelector(".genobi-grid").getBoundingClientRect().width,
    font: getComputedStyle(document.querySelector(".studio")).fontSize,
  }));
  await page.goto(editor);
  await ready();
  const current = await page.evaluate(() => {
    const console = document.querySelector(".dir-console");
    return {
      width: document
        .querySelector(".genobi-panel-timeline")
        .getBoundingClientRect().width,
      font: getComputedStyle(console).fontSize,
      height: console.getBoundingClientRect().height,
    };
  });
  assert.equal(current.width, reference.width);
  assert.equal(current.font, reference.font);
  assert.ok(current.height < 850, JSON.stringify(current));
  const boxes = await Promise.all(
    ["Play", "Stop", "Loop playback", "Split selected clip"].map((name) =>
      page.getByRole("button", { name, exact: true }).boundingBox(),
    ),
  );
  assert.ok(
    boxes.every(
      (b) =>
        Math.abs(b.y + b.height / 2 - (boxes[0].y + boxes[0].height / 2)) < 1,
    ),
  );
  // The Editor transport's 36 px buttons (timeline design, #178).
  assert.ok(boxes.every((b) => b.height === 36));
  // Every row at the height the timeline design sets (its own height plus a
  // 1 px rule): 30 px layers and Markers/Rhythm, 44 px audio, 40 px Camera and
  // Action, a 92 px storyboard lane. All of them fit the timeline's view.
  const rows = await page.locator(".dir-lane").evaluateAll((es) =>
    es.map((e) => ({
      kind: [...e.classList].find((c) => c.startsWith("lane-")),
      height: e.getBoundingClientRect().height,
      bottom: e.getBoundingClientRect().bottom,
    })),
  );
  const designed = {
    "lane-markers": 31,
    "lane-rhythm": 31,
    "lane-filter": 31,
    "lane-graphics": 31,
    "lane-image": 31,
    "lane-storyboard": 93,
    "lane-camera": 41,
    "lane-action": 41,
    "lane-audio": 45,
  };
  assert.equal(rows.length, 13);
  for (const r of rows)
    assert.equal(r.height, designed[r.kind], JSON.stringify(r));
  assert.equal(rows.filter((r) => r.kind === "lane-storyboard").length, 1);
  const view = await page.locator(".director .dir-timeline").boundingBox();
  assert.ok(
    rows.at(-1).bottom <= view.y + view.height + 0.5,
    `last row ${rows.at(-1).bottom} below the timeline's view ${view.y + view.height}`,
  );
  assert.equal(
    await page.locator(".dir-foot,.dir-add,.dir-shortcuts").count(),
    0,
  );
  const layerRows = page.locator(".dir-lane:not(.dir-view)");
  assert.equal(
    await layerRows.getByRole("button", { name: /Mute / }).count(),
    1,
  );
  assert.equal(
    await layerRows.getByRole("button", { name: /Hide / }).count(),
    8,
  );
  const before = await page.locator(".dir-track").first().boundingBox();
  await page
    .getByRole("button", { name: "Show inspector", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).waitFor();
  assert.equal(
    (await page.locator(".dir-track").first().boundingBox()).width,
    before.width,
  );
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await page.waitForTimeout(250);
  assert.equal(
    await page.getByLabel("Name", { exact: true }).isVisible(),
    false,
  );
  await page
    .getByRole("button", { name: "Fold channels", exact: true })
    .click();
  await page.waitForTimeout(250);
  assert.equal(
    await page
      .locator(".dir-gutter")
      .first()
      .evaluate((e) => e.getBoundingClientRect().width),
    40,
  );
  assert.equal(
    await page
      .locator(".dir-timeline-grid")
      .evaluate((e) => e.getBoundingClientRect().x),
    (await page.locator(".dir-track").first().boundingBox()).x,
  );
  await page.screenshot({
    path: ".local/director/compact-folded.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Expand channels", exact: true })
    .click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "Add layer", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Add track", exact: true });
  await dialog
    .getByLabel("Track name", { exact: true })
    .fill("My rendered animation");
  await drop(
    dialog.locator(".dir-asset-drop"),
    "docs/director-bundle/example/media/orbit-motion.mp4",
    "video/mp4",
  );
  assert.equal(await page.locator(".dir-clip").count(), 9);
  await dialog.getByRole("button", { name: "Add track", exact: true }).click();
  await clip("My rendered animation").waitFor();
  await ready();
  assert.equal(await page.locator(".dir-clip").count(), 10);
  await clip("My rendered animation").dblclick();
  await page.getByLabel("Name", { exact: true }).fill("Renamed animation");
  await page.getByLabel("Name", { exact: true }).press("Tab");
  await ready();
  let json = await save("compact-media");
  const video = json.layers.find((l) => l.name === "Renamed animation");
  assert.equal(video.kind, "video");
  assert.equal(json.assets[video.assetId].kind, "video");
  await drop(
    page.locator(".dir-timeline"),
    "docs/director-bundle/example/media/orbit-1.png",
    "image/png",
  );
  await clip("orbit-1.png").waitFor();
  await ready();
  await page.waitForTimeout(250);
  assert.equal(
    await page.getByLabel("Name", { exact: true }).isVisible(),
    false,
  );
  assert.equal(await page.locator(".dir-clip").count(), 11);
  await page.getByRole("button", { name: "Add layer", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Add track", exact: true });
  await dialog
    .getByRole("button", { name: "Type Media · detect from file", exact: true })
    .click();
  await dialog
    .getByRole("option", { name: "p5 · rings graphics", exact: true })
    .click();
  await dialog.getByLabel("Track name", { exact: true }).fill("Beat targets");
  await dialog.getByRole("button", { name: "Add track", exact: true }).click();
  await clip("Beat targets").waitFor();
  await ready();
  json = await save("compact-tracks");
  assert.equal(
    json.layers.find((l) => l.name === "Beat targets").kind,
    "graphics",
  );
  console.log(
    "PASS shell grid width and studio font, aligned compact transport, all tracks visible, inspector overlay, animated channel fold, media icons, named dialog drop, automatic track drop, renamed JSON, graphics track",
  );
  // A short composition proves the actual preview loops and stops independently of export.
  const short = JSON.parse(
    await readFile("docs/director-bundle/example/studio.json", "utf8"),
  );
  short.composition.durationFrames = 12;
  short.layers = short.layers.map((l) => ({
    ...l,
    startFrame: 0,
    durationFrames: 12,
  }));
  await page.locator('.director input[accept=".zip,.json"]').setInputFiles({
    name: "loop.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(short)),
  });
  await ready();
  await page.evaluate(() => {
    window.loopFrames = [];
    const canvas = document.querySelector(
      'canvas[aria-label="Director preview"]',
    );
    new MutationObserver(() =>
      window.loopFrames.push(Number(canvas.dataset.frame)),
    ).observe(canvas, { attributes: true, attributeFilter: ["data-frame"] });
  });
  await page
    .getByRole("button", { name: "Loop playback", exact: true })
    .click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(1500);
  assert.ok(
    await page.getByRole("button", { name: "Pause", exact: true }).isVisible(),
  );
  const frames = await page.evaluate(() => window.loopFrames);
  assert.ok(
    frames.filter((f, i) => i && f < frames[i - 1]).length >= 2,
    JSON.stringify(frames),
  );
  await page
    .getByRole("button", { name: "Loop playback", exact: true })
    .click();
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  console.log("PASS real audio-clock looping and switching loop off");
  // The Editor's stage takes asset drops.
  await page.goto(editor);
  await ready();
  await drop(
    page.locator(".dir-stage"),
    "docs/director-bundle/example/media/orbit-2.png",
    "image/png",
  );
  await clip("orbit-2.png").waitFor();
  await ready();
  await page.screenshot({ path: ".local/director/compact-stage-drop.png" });
  await page.goto(editor);
  await ready();
  await page.screenshot({
    path: ".local/director/compact-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({
    path: ".local/director/compact-portrait.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Fold channels", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show inspector", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".dir-inspector-drawer")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS stage asset drop, portrait layout, reduced-motion panels and no errors",
  );
} finally {
  await browser.close();
}
