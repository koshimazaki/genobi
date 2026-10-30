/**
 * The Editor's Program row follows its ↕ handle, in a browser against the
 * local studio:
 *   DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-editor-program-height.mjs
 * At 1440 and 390 px wide (device pixel ratio 2): dragging the Program
 * panel's ↕ down, or pressing ArrowDown on it, makes the preview taller; widening the column grows the contained picture; the
 * lightbox still opens; the preview's backing store stays the composition's
 * own size. Until the first frame is drawn, a status covers the canvas. The
 * first-run guide is marked seen before load, since it covers the Editor.
 * Nothing is generated: a generation request is refused and counted.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local studio",
);
const output = process.env.STUDIO_EVIDENCE ?? ".local/editor-program-height";
await mkdir(output, { recursive: true });
const editor = `${base}/director?example=studio&workspace=editor`;
const HANDLE = ".genobi-panel-stage .editor-panel-resize";
const browser = await chromium.launch({ headless: true });
let generations = 0;
const errors = [];

async function open(width) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.addInitScript(() =>
    localStorage.setItem("genobi.startup-guide.v1", "seen"),
  );
  page.on("pageerror", (e) => errors.push(`${width}: ${e.message}`));
  await page.route("**/api/jobs", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    generations++;
    return route.abort();
  });
  // Records every status shown over the blank canvas before the first frame.
  await page.addInitScript(() => {
    window.__pending = [];
    new MutationObserver(() => {
      const el = document.querySelector(".dir-stage-pending");
      if (el && !window.__pending.includes(el.textContent))
        window.__pending.push(el.textContent);
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(editor);
  return page;
}

/** Canvas box, the picture contained in it, and the prompt's height. */
const measure = (page) =>
  page.evaluate(() => {
    const c = document.querySelector(".dir-program-row canvas");
    const t = document.querySelector(".dir-project-direction textarea");
    const b = c.getBoundingClientRect();
    const fit = Math.min(b.width / c.width, b.height / c.height);
    return {
      box: { width: b.width, height: b.height },
      picture: { width: c.width * fit, height: c.height * fit },
      backing: { width: c.width, height: c.height },
      textarea: t.getBoundingClientRect().height,
      canvasBottom: b.bottom,
      canvasRight: b.right,
      promptTop: t.getBoundingClientRect().top,
      promptLeft: t.getBoundingClientRect().left,
      display: getComputedStyle(document.querySelector(".dir-program-row"))
        .display,
      composition: document
        .querySelector(".dir-program-row .dir-stage-meta span:nth-child(2)")
        .textContent.trim(),
    };
  });

async function ready(page) {
  await page.waitForSelector(".dir-program-row canvas");
  await page.waitForSelector(".dir-stage-footer .dir-live", {
    timeout: 30000,
  });
}

for (const width of [1440, 390]) {
  const page = await open(width);
  await ready(page);
  const start = await measure(page);
  assert(
    start.promptTop < start.canvasBottom,
    `${width}: the global prompt sits above Program`,
  );
  const [w, h] = start.composition.split("/")[0].split("×").map(Number);
  assert.deepEqual(
    start.backing,
    { width: w, height: h },
    `${width}: backing store is the composition`,
  );
  await page.locator(".dir-program-row").screenshot({
    path: `${output}/program-${width}-natural.png`,
  });

  const handle = page.locator(HANDLE);
  // Centre it: the fixed voice bar covers the bottom of a phone viewport.
  await handle.evaluate((e) => e.scrollIntoView({ block: "center" }));
  const at = await handle.boundingBox();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2 + 200, {
    steps: 8,
  });
  await page.mouse.up();
  const dragged = await measure(page);
  assert(
    dragged.box.height > start.box.height + 60,
    `${width}: drag grows the preview`,
  );
  // On a phone the picture is already as wide as the column; it may only
  // grow to that width, so the row's extra height is letterbox there.
  const room = Math.min(
    dragged.box.width / start.backing.width,
    dragged.box.height / start.backing.height,
  );
  assert(
    Math.abs(dragged.picture.height - start.backing.height * room) < 1 &&
      dragged.picture.height >= start.picture.height,
    `${width}: the picture is contained, never stretched or shrunk`,
  );
  if (width === 1440)
    assert(
      dragged.picture.height > start.picture.height + 30,
      `${width}: drag grows the picture`,
    );
  assert(
    dragged.textarea === start.textarea,
    `${width}: resizing preserves the prompt above the monitors`,
  );
  assert.deepEqual(dragged.backing, start.backing, `${width}: same backing`);

  await handle.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  const keyed = await measure(page);
  assert(
    keyed.box.height > dragged.box.height + 20,
    `${width}: keyboard grows the preview`,
  );
  assert(
    keyed.textarea === dragged.textarea,
    `${width}: keyboard resize preserves prompt height`,
  );
  await page.locator(".dir-program-row").screenshot({
    path: `${output}/program-${width}-taller.png`,
  });

  if (width === 1440) {
    const divider = page.getByRole("separator", { name: "Preview width" });
    await divider.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowRight");
    const wider = await measure(page);
    assert(
      wider.picture.width > keyed.picture.width + 40,
      "1440: widening the column grows the picture",
    );
    await page.locator(".dir-program-row").screenshot({
      path: `${output}/program-${width}-wider.png`,
    });
  }

  await page.getByRole("button", { name: "Enlarge preview" }).click();
  const box = await page
    .getByRole("dialog", { name: "Program" })
    .locator("canvas")
    .boundingBox();
  assert(box && box.width > 200, `${width}: lightbox shows the preview`);
  await page.keyboard.press("Escape");
  await page.close();
}

{
  const page = await open(1440);
  await ready(page);
  const shown = await page.evaluate(() => window.__pending);
  assert(
    shown.some((t) => /first frame/i.test(t)),
    `a status covered the blank canvas: ${JSON.stringify(shown)}`,
  );
  assert.equal(
    await page.locator(".dir-stage-pending").count(),
    0,
    "status clears once drawn",
  );
  await page.close();
}

await browser.close();
assert.equal(generations, 0, "no generation was requested");
assert.deepEqual(errors, [], "no page errors");
console.log(`Program row height checks passed; evidence in ${output}`);
