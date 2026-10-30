// Start Vite first. Exercises timeline geometry and actual pointer capture.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `${process.env.DIRECTOR_URL ?? "http://127.0.0.1:5175"}/director?example=studio&workspace=editor`,
  );
  const ready = () =>
    page.getByText("Ready · local preview", { exact: true }).waitFor();
  await ready();
  const clip = (name) =>
    page.getByRole("button", { name: `Select ${name}`, exact: true });
  const positions = () =>
    page
      .locator(".dir-clip")
      .evaluateAll((clips) =>
        Object.fromEntries(
          clips.map((c) => [
            c.dataset.layerId,
            { left: c.style.left, width: c.style.width },
          ]),
        ),
      );
  const initial = await positions();
  const sameStart = async () => {
    const a = await clip("Three dither").boundingBox();
    const b = await clip("Orbit 2").boundingBox();
    assert.ok(Math.abs(a.x - b.x) < 0.01, `Same start: ${a.x} vs ${b.x}`);
  };
  await sameStart();
  for (const zoom of [2, 5, 7, 3]) {
    await page
      .getByRole("slider", { name: "Zoom", exact: true })
      .fill(String(zoom));
    await sameStart();
    const ticks = await page
      .locator(".dir-frame-scale i")
      .evaluateAll((list) =>
        list.map((e) => parseFloat(e.style.left)).sort((a, b) => a - b),
      );
    const step = zoom;
    ticks.forEach((x, i) => assert.equal(x, i * step));
  }
  console.log("PASS common origin and even frame spacing through zoom changes");
  const image = clip("Orbit 1");
  await image.scrollIntoViewIfNeeded();
  let box = await image.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 17);
  await page.mouse.down();
  await page.mouse.move(box.x + 25 + 87, box.y + 17, { steps: 6 });
  await page.locator('.dir-align-guide[data-frame="90"]').waitFor();
  assert.ok((await image.getAttribute("class")).includes("is-aligned"));
  assert.ok(
    (await clip("Orbit 2").getAttribute("class")).includes("is-aligned"),
  );
  const dragging = await positions();
  const id = await image.getAttribute("data-layer-id");
  for (const [key, value] of Object.entries(initial))
    if (key !== id)
      assert.deepEqual(dragging[key], value, `${key} moved unexpectedly`);
  await mkdir(".local/director", { recursive: true });
  await page.screenshot({
    path: ".local/director/aligned-grid.png",
    fullPage: true,
  });
  await page.mouse.up();
  await ready();
  assert.equal(
    await page.getByLabel("Start frame", { exact: true }).inputValue(),
    "90",
  );
  console.log(
    "PASS magnetic edge alignment, both clips highlighted, other lanes unchanged",
  );
  // Returning within the click threshold must clear the old ghost position.
  box = await image.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 17);
  await page.mouse.down();
  await page.mouse.move(box.x + 37, box.y + 17);
  await page.mouse.move(box.x + 26, box.y + 17);
  assert.equal((await positions())[id].left, "270px");
  await page.mouse.up();
  console.log("PASS drag returns to original position without release jump");
  // Trim the end toward Anime's end at frame150.
  box = await image.boundingBox();
  await page.mouse.move(box.x + box.width - 3, box.y + 17);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 3 + 87, box.y + 17, { steps: 6 });
  await page.locator('.dir-align-guide[data-frame="150"]').waitFor();
  await page.mouse.up();
  await ready();
  assert.equal(
    await page.getByLabel("Duration frames", { exact: true }).inputValue(),
    "60",
  );
  console.log("PASS trim snaps to matching end frame");
  const locked = clip("Anime bars"),
    before = await positions();
  await locked.scrollIntoViewIfNeeded();
  box = await locked.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 17);
  await page.mouse.down();
  await page.mouse.move(box.x + 55, box.y + 17);
  await page.mouse.up();
  assert.deepEqual(await positions(), before);
  console.log("PASS locked clips remain fixed");
  await image.click();
  await page
    .getByRole("button", { name: "Show inspector", exact: true })
    .click();
  await page.getByLabel("Start frame", { exact: true }).fill("62");
  await page.getByLabel("Start frame", { exact: true }).press("Tab");
  await ready();
  await page.getByRole("radio", { name: "Snap Beat", exact: true }).check();
  await image.focus();
  await image.press("ArrowRight");
  await ready();
  assert.equal(
    await page.getByLabel("Start frame", { exact: true }).inputValue(),
    "75",
  );
  console.log("PASS keyboard nudges to absolute beat grid");
  // A downbeat at 0.2 s (frame 6 at 30 fps) moves the grid and its bar lines.
  // Timing fields live behind the transport's Timing disclosure.
  await page.locator("details.dir-timing").evaluate((d) => (d.open = true));
  const offset = page.getByLabel("Beat offset seconds", { exact: true });
  await offset.fill("0.2");
  await offset.press("Tab");
  await ready();
  await image.focus();
  await image.press("ArrowRight");
  await ready();
  assert.equal(
    await page.getByLabel("Start frame", { exact: true }).inputValue(),
    "81",
  );
  // Bar lines every 4 beats from frame 6: 6, 66, 126 at 30 fps and 120 BPM.
  const xs = async (kind) =>
    [
      ...(
        await page.locator(`.dir-timeline-grid path.${kind}`).getAttribute("d")
      ).matchAll(/M([\d.]+),/g),
    ].map((m) => Number(m[1]) - 0.5);
  const perFrame = (await xs("second"))[1] / 30;
  assert.deepEqual(
    (await xs("bar")).map((x) => x / perFrame),
    [6, 66, 126],
  );
  console.log("PASS downbeat offset moves the beat grid and bar lines");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
