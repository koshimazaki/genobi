/** Local-only layout verification; all API routes are fixtures, generation is blocked. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4337";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = process.env.STUDIO_EVIDENCE ?? "/tmp/genobi-ninja-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.route("**/api/**", (route) => {
  const url = new URL(route.request().url());
  if (route.request().method() !== "GET") return route.abort();
  return route.fulfill({
    json:
      url.pathname === "/api/health"
        ? { hasServerKey: false }
        : { jobs: [], sources: [] },
  });
});
const page = await context.newPage();
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
const button = (name) => page.getByRole("button", { name, exact: true });
const order = () =>
  page
    .locator(".genobi-grid > [data-panel]:not([hidden])")
    .evaluateAll((els) => els.map((e) => e.dataset.panel));
const settle = () => page.waitForTimeout(800);
const load = (value) =>
  page.getByLabel("Load Ninja layout JSON").setInputFiles({
    name: "layout.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
const fixture = (panels) => ({
  format: "genobi.ninja-layout",
  version: 3,
  panels,
});
try {
  await page.goto(`${base}/?workspace=ninja`);
  await page
    .getByRole("textbox", { name: "Headline", exact: true })
    .fill("KEEP THE PROJECT");
  const canvas = await page
    .locator('canvas[aria-label="Director preview"]')
    .elementHandle();
  await settle();
  const grip = button("Move Composition");
  await grip.scrollIntoViewIfNeeded();
  const a = await grip.boundingBox();
  const b = await page
    .locator('[data-panel="inputs"] .genobi-panel-heading')
    .boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + 20, { steps: 12 });
  await page.mouse.up();
  await settle();
  assert.deepEqual(await order(), [
    "inputs",
    "stage",
    "prompt",
    "tools",
    "project",
    "inspirations",
  ]);
  assert(await canvas.evaluate((el) => el.isConnected));
  assert.equal(
    await page
      .getByRole("textbox", { name: "Headline", exact: true })
      .inputValue(),
    "KEEP THE PROJECT",
  );
  await grip.focus();
  await page.keyboard.press("ArrowLeft");
  await settle();
  assert.equal((await order())[0], "stage");
  checks.push(
    "Mouse drag and keyboard move preserve canvas and project edits; DOM order follows visual order",
  );
  await button("Full width Composition").click();
  await page
    .getByRole("checkbox", { name: "Camera direction", exact: true })
    .check();
  await button("Save layout").click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("genobi.ninja-layout.v1")),
  );
  assert.equal(saved.panels[0].width, "full");
  assert.equal(await page.locator(".genobi-ninja-controls").count(), 0);
  assert.equal(await page.locator(".genobi-panel-arrange").count(), 0);
  await button("Configure Ninja").click();
  const downloadPromise = page.waitForEvent("download");
  await button("Download JSON").click();
  const download = await downloadPromise;
  const json = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.deepEqual(json, saved);
  assert.deepEqual(Object.keys(json), ["format", "version", "panels"]);
  await page.reload();
  await button("Configure Ninja").waitFor();
  assert.equal(
    await button("Configure Ninja").getAttribute("aria-pressed"),
    "false",
  );
  await button("Configure Ninja").click();
  await page.getByText("Saved layout restored.", { exact: true }).waitFor();
  assert.deepEqual(
    await order(),
    saved.panels.map((p) => p.id),
  );
  assert.equal(
    await button("Full width Composition").getAttribute("aria-pressed"),
    "true",
  );
  await button("Reset layout").click();
  await button("Revert changes").click();
  assert.deepEqual(
    await order(),
    saved.panels.map((p) => p.id),
  );
  checks.push(
    "Save, download, reload, reset and revert retain selection/order/width",
  );
  await load({ ...saved, panels: [{ id: "unknown", width: "full" }] });
  await page
    .getByText("Layout has an unknown, duplicate or invalid panel.", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(
    await order(),
    saved.panels.map((p) => p.id),
  );
  await load(fixture([]));
  await page
    .getByText("A little room to think. Choose a panel above to begin.")
    .waitFor();
  await load(json);
  await page
    .getByText("Layout loaded. Save layout to remember it in this browser.", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(
    await order(),
    saved.panels.map((p) => p.id),
  );
  checks.push(
    "Invalid import leaves layout intact; empty layouts and JSON round trip work",
  );
  // Heavy tool removal must hide, not destroy, its scene.
  await page
    .getByRole("checkbox", { name: "World Builder", exact: true })
    .check();
  const world = page.getByLabel("World Builder scene", { exact: true });
  await world.waitFor();
  const scene = await world.elementHandle();
  await page
    .getByRole("checkbox", { name: "World Builder", exact: true })
    .uncheck();
  assert(await scene.evaluate((el) => el.isConnected));
  await page
    .getByRole("checkbox", { name: "World Builder", exact: true })
    .check();
  assert(await scene.evaluate((el) => el.isConnected));
  checks.push("World Builder survives deselection and reselection");
  await load(saved);
  await page
    .getByText("Layout loaded. Save layout to remember it in this browser.", {
      exact: true,
    })
    .waitFor();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await settle();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `overflow at ${width}`,
    );
    await page.screenshot({
      path: `${output}/ninja-${width}.png`,
      fullPage: true,
    });
  }
  checks.push(
    "Desktop, tablet, 390px and 320px fit without horizontal overflow",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await button("Move Composition later").click();
  assert.equal(
    await page.evaluate(
      () =>
        document
          .querySelector(".genobi-grid")
          .getAnimations({ subtree: true })
          .filter((a) => a.playState === "running").length,
    ),
    0,
  );
  checks.push("Reduced-motion reorder has no running panel animation");
  // Real touch input through Chromium, with short panels to keep both targets onscreen.
  await page.setViewportSize({ width: 390, height: 1000 });
  await load(
    fixture([
      { id: "project", width: "half" },
      { id: "file", width: "full" },
    ]),
  );
  await page
    .getByText("Layout loaded. Save layout to remember it in this browser.", {
      exact: true,
    })
    .waitFor();
  await button("Move Assets").evaluate((el) =>
    el.scrollIntoView({ block: "start" }),
  );
  const start = await button("Move Assets").boundingBox();
  const end = await page
    .locator('[data-panel="file"] .genobi-panel-heading')
    .boundingBox();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: start.x + 10, y: start.y + 10 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: end.x + 20, y: end.y + 20 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.deepEqual(await order(), ["file", "project"]);
  checks.push("Touch drag reorders panels at phone width");
  await load(
    fixture(
      [
        "preview",
        "composer",
        "gallery",
        "inputs",
        "prompt",
        "stage",
        "templates",
        "timeline",
        "tools",
        "project",
        "inspirations",
        "file",
        "world",
        "dual",
      ].map((id) => ({ id, width: "half" })),
    ),
  );
  await page.getByLabel("World Builder scene", { exact: true }).waitFor();
  await page.getByLabel("Choose video A", { exact: true }).waitFor();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await settle();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `all panels half-width overflow at ${width}`,
    );
  }
  checks.push(
    "All fourteen panels selected at half width fit desktop, tablet and phone layouts",
  );
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "genobi.ninja-layout.v1") throw new Error("blocked");
      return original.call(this, key, value);
    };
  });
  await button("Save layout").click();
  await page
    .getByText(
      "Browser storage is unavailable. Download the layout JSON to keep it.",
      { exact: true },
    )
    .waitFor();
  checks.push(
    "Blocked browser storage reports failure and leaves JSON backup available",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, output }, null, 2));
} finally {
  await browser.close();
}
