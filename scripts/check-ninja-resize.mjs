/** Local UI check: network generation is blocked. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = "/tmp/genobi-adjustable-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/**", (route) =>
  route.request().method() !== "GET"
    ? route.abort()
    : route.fulfill({ json: { hasServerKey: false, jobs: [], sources: [] } }),
);
const button = (name) => page.getByRole("button", { name, exact: true });
const settle = () => page.waitForTimeout(850);
try {
  await page.goto(`${base}/?workspace=ninja`);
  await page
    .getByRole("textbox", { name: "Animation prompt", exact: true })
    .waitFor();
  const load = (panels) =>
    page.getByLabel("Load Ninja layout JSON").setInputFiles({
      name: "layout.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "genobi.ninja-layout", version: 3, panels }),
      ),
    });
  await load([
    { id: "stage", width: "half", columns: 6, height: 440 },
    { id: "prompt", width: "half", columns: 6, height: 600 },
    { id: "composer", width: "half", columns: 6, height: 520 },
    { id: "project", width: "half", columns: 6, height: 250 },
    { id: "inspirations", width: "half", columns: 6, height: 250 },
  ]);
  await settle();
  const stage = page.locator('[data-panel="stage"]');
  const canvas = await stage.locator("canvas").elementHandle();
  const promptPanel = page.locator('[data-panel="prompt"]');
  const promptBefore = await promptPanel.locator("textarea").boundingBox();
  await button("Resize Prompt").focus();
  await page.keyboard.press("Shift+ArrowDown");
  await settle();
  assert(
    (await promptPanel.locator("textarea").boundingBox()).height >
      promptBefore.height,
  );
  const first = await stage.boundingBox();
  const resize = button("Resize Composition");
  await resize.focus();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("ArrowRight");
  await settle();
  assert.equal(Math.round((await stage.boundingBox()).height), 472);
  assert((await stage.boundingBox()).width > first.width);
  assert(await canvas.evaluate((el) => el.isConnected));
  await resize.scrollIntoViewIfNeeded();
  const handle = await resize.boundingBox();
  await page.mouse.move(handle.x + 12, handle.y + 12);
  await page.mouse.down();
  await page.mouse.move(handle.x - 100, handle.y + 76, { steps: 8 });
  await page.mouse.up();
  await settle();
  assert(Math.round((await stage.boundingBox()).height) > 520);
  await button("Fill preview Composition").click();
  assert.equal(
    await stage
      .locator("canvas")
      .evaluate((el) => getComputedStyle(el).objectFit),
    "cover",
  );
  await button("Fit content Composition").click();
  await settle();
  assert.equal(await stage.getAttribute("data-sized"), null);
  await button("Fill gaps").click();
  assert.equal(
    await page
      .locator(".genobi-grid")
      .evaluate((el) => getComputedStyle(el).gridAutoFlow),
    "row",
  );
  await button("Fill gaps").click();
  await button("Save layout").click();
  assert.equal(await page.locator(".genobi-ninja-controls").count(), 0);
  assert.equal(await page.locator(".genobi-panel-arrange").count(), 0);
  assert.equal(await page.locator(".genobi-resize-handle").count(), 0);
  await page.reload();
  await button("Configure Ninja").waitFor();
  assert.equal(
    await button("Configure Ninja").getAttribute("aria-pressed"),
    "false",
  );
  const prompt = page.getByRole("textbox", {
    name: "Animation prompt",
    exact: true,
  });
  await prompt.fill("Animate the character using ");
  await prompt.press("End");
  await button("+ Image").click();
  await button("Open assets & inspirations").click();
  await page
    .getByLabel("Add assets", { exact: true })
    .setInputFiles([
      "docs/director-bundle/templates/poster-motion.png",
      "docs/director-bundle/example/media/test-pattern.mp4",
    ]);
  await page
    .getByText("Added to project. Choose where to use it.", { exact: true })
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .locator(".prompt-picker-grid button")
    .filter({ hasText: "poster-motion.png" })
    .click();
  assert((await prompt.inputValue()).includes("[Image 1]"));
  await button("Change Image 1").click();
  assert(await page.getByRole("region", { name: "Choose image" }).isVisible());
  await page
    .locator(".prompt-asset-picker")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await button("+ Video").click();
  await page
    .locator(".prompt-picker-grid button")
    .filter({ hasText: "test-pattern.mp4" })
    .click();
  await button("Change Video 1").waitFor();
  await button("+ Font").click();
  await page
    .getByLabel("Add prompt font", { exact: true })
    .setInputFiles(
      "node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
    );
  await button("Change Font 1").waitFor();
  const downloadEvent = page.waitForEvent("download");
  await button("Download brief + files").click();
  const downloaded = await downloadEvent;
  const zip = unzipSync(
    new Uint8Array(await readFile(await downloaded.path())),
  );
  const brief = JSON.parse(new TextDecoder().decode(zip["brief.json"]));
  assert(brief.references.some((r) => r.kind === "video"));
  assert(brief.references.some((r) => r.kind === "font"));
  assert(brief.references.some((r) => r.kind === "image"));
  for (const r of brief.references) assert(zip[r.path]?.length);
  assert(
    await page.getByRole("region", { name: "Assets", exact: true }).isVisible(),
  );
  assert(
    await page
      .getByRole("region", { name: "Inspirations", exact: true })
      .isVisible(),
  );
  await page
    .locator('[data-panel="project"] .dir-assets-launch button')
    .click();
  const projectDownloadEvent = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save editable project", exact: true })
    .click();
  const projectDownload = await projectDownloadEvent;
  const projectZip = unzipSync(
    new Uint8Array(await readFile(await projectDownload.path())),
  );
  assert(projectZip["brief/prompt.json"]);
  for (const r of brief.references) assert(projectZip[r.path]?.length);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .locator(".project-prompt")
    .screenshot({ path: `${output}/asset-prompt.png` });
  await page.locator(".wordmark").screenshot({ path: `${output}/logo.png` });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    await settle();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `overflow ${width}`,
    );
    await page.screenshot({
      path: `${output}/ninja-${width}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify(
      {
        resize: true,
        fit: true,
        compact: true,
        imagePicker: true,
        fontPicker: true,
        exportedFiles: Object.keys(zip),
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      output,
      references: brief.references.map((r) => r.label),
      errors,
    }),
  );
} finally {
  await browser.close();
}
