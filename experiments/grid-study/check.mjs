/* global window, document, innerWidth, process, URL, console */
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const base = process.env.STUDY_URL ?? "http://127.0.0.1:4324";
const out = process.env.STUDY_OUT ?? "/tmp/genobi-grid-checks";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  channel: process.env.CHROME_BIN ? undefined : "chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const reports = [];
try {
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 1080 },
    phone: { width: 390, height: 844 },
  })) {
    const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
      }),
      errors = [],
      external = [];
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== new URL(base).origin) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/experiments/grid-study/");
    await page.waitForFunction(() => window.gridStudy?.get().ready);
    const result = await page.evaluate(async () => {
      const canvas = window.gridStudy.canvas,
        ctx = canvas.getContext("2d");
      const hash = () => canvas.toDataURL();
      const parity = {};
      for (const mode of ["poster", "water"]) {
        await window.gridStudy.set({
          mode,
          intensity: 0.64,
          grid: false,
          frame: 48,
        });
        const first = hash();
        await window.render(95);
        await window.render(3);
        await window.render(48);
        parity[mode] = first === hash();
      }
      await window.gridStudy.set({ mode: "poster", intensity: 0, frame: 48 });
      const original = hash(),
        source = ctx.getImageData(384, 180, 192, 180).data;
      await window.gridStudy.set({ mode: "water", intensity: 0 });
      const zero = original === hash();
      await window.gridStudy.set({ intensity: 1, grid: false });
      const center = ctx.getImageData(384, 180, 192, 180).data;
      const stableCenter = source.every((value, i) => value === center[i]);
      const changed = original !== hash();
      const before = JSON.stringify(window.gridStudy.get());
      let refused = false;
      try {
        await window.gridStudy.set({ mode: ["water"], intensity: 0.1 });
      } catch {
        refused = JSON.stringify(window.gridStudy.get()) === before;
      }
      let undefinedPatchesRefused = true;
      for (const key of ["mode", "frame", "intensity", "grid"]) {
        const unchanged = JSON.stringify(window.gridStudy.get());
        try {
          await window.gridStudy.set({ [key]: undefined });
          undefinedPatchesRefused = false;
        } catch {
          undefinedPatchesRefused &&=
            JSON.stringify(window.gridStudy.get()) === unchanged;
        }
      }
      return {
        undefinedPatchesRefused,
        parity,
        zero,
        stableCenter,
        changed,
        invalidPatchRefused: refused,
        diagnostics: window.gridStudy.get(),
      };
    });
    assert.deepEqual(result.parity, { poster: true, water: true });
    assert(result.zero);
    assert(result.stableCenter, "locked center matches primary-time source");
    assert(result.changed);
    assert(result.invalidPatchRefused);
    assert(result.undefinedPatchesRefused);
    assert.equal(result.diagnostics.atlasDecodes, 1);
    assert(result.diagnostics.cachedPixelFrames <= 8);
    for (const mode of ["poster", "water"]) {
      await page.locator(`[data-mode="${mode}"]`).click();
      await page.evaluate(() =>
        window.gridStudy.set({ intensity: 0.64, grid: true, frame: 40 }),
      );
      await page.screenshot({
        path: `${out}/${name}-${mode}.png`,
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.locator("#frame").fill("24");
    await page.waitForFunction(() => window.gridStudy.get().frame === 24);
    await page.locator("#intensity").fill("0.3");
    await page.waitForFunction(() => window.gridStudy.get().intensity === 0.3);
    await page.getByRole("button", { name: "Play study", exact: true }).click();
    await page.waitForFunction(() => window.gridStudy.get().frame > 27);
    await page
      .getByRole("button", { name: "Pause study", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => window.gridStudy.get().playing),
      false,
    );
    await page.evaluate(async () => {
      await window.gridStudy.set({ frame: 0 });
      const b = document.querySelector("#play");
      b.click();
      for (let i = 0; i < 8; i++) {
        b.click();
        b.click();
      }
    });
    await page.waitForFunction(() => window.gridStudy.get().frame > 3);
    await page
      .getByRole("button", { name: "Pause study", exact: true })
      .click();
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    reports.push({ viewport: name, result: "PASS", ...result });
    await context.close();
  }
  const metadata = JSON.parse(
    await readFile(new URL("./media/source.json", import.meta.url), "utf8"),
  );
  const bytes = await readFile(
    new URL("../../" + metadata.source, import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    metadata.sourceSha256,
  );
  await writeFile(
    `${out}/checks.json`,
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
}
