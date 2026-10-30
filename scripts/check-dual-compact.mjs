/** Local fixture-only regression: compact, independent side-by-side frame controls. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = process.env.STUDIO_URL ?? "http://127.0.0.1:5397";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".local/dual-compact";
await mkdir(output, { recursive: true });
const sources = JSON.parse(await readFile("public/media/gallery.json", "utf8"));
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    // The first-run setup dialog is not under test here.
    await page.addInitScript(() =>
      localStorage.setItem("genobi-setup-seen-v1", "1"),
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (route) => {
      if (route.request().method() !== "GET") return route.abort();
      return route.fulfill({
        json: { jobs: [], sources, hasServerKey: false },
      });
    });
    await page.goto(`${base}/?workspace=dual`);
    const a = page.getByRole("region", { name: "Video A", exact: true });
    const b = page.getByRole("region", { name: "Video B", exact: true });
    await a.waitFor();
    assert.equal(
      await page.getByRole("group", { name: "Viewer layout" }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: /Link ±1/ }).count(),
      0,
    );
    for (const panel of [a, b]) {
      assert.equal(
        await panel
          .getByRole("button", { name: /^Frame position/ })
          .getAttribute("aria-expanded"),
        "true",
      );
      assert.equal(
        await panel
          .getByRole("button", { name: /^Luma distribution/ })
          .getAttribute("aria-expanded"),
        "false",
      );
    }
    const video = resolve(
      "docs/director-bundle/example/media/test-pattern.mp4",
    );
    await page
      .getByLabel("Choose video A", { exact: true })
      .setInputFiles(video);
    await page
      .getByLabel("Choose video B", { exact: true })
      .setInputFiles(video);
    const nextA = a.getByRole("button", {
      name: "Video A next frame",
      exact: true,
    });
    await nextA.waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".de-export button")].every(
        (b) => !b.disabled,
      ),
    );
    const index = (panel) =>
      panel.getByRole("spinbutton", { name: /frame number/ }).inputValue();
    await nextA.click();
    await page.waitForTimeout(100);
    assert.equal(await index(a), "1");
    assert.equal(await index(b), "0");
    await b
      .getByRole("button", { name: "Video B next frame", exact: true })
      .click();
    await page.waitForTimeout(100);
    assert.equal(await index(a), "1");
    assert.equal(await index(b), "1");
    const luma = a.getByRole("button", { name: /^Luma distribution/ });
    await luma.click();
    assert.equal(await luma.getAttribute("aria-expanded"), "true");
    await a.getByRole("button", { name: /^Frame position/ }).click();
    assert.equal(await luma.getAttribute("aria-expanded"), "true");
    await a.getByRole("button", { name: /^Frame position/ }).click();
    assert.equal(await index(a), "1");
    await luma.click();
    await page.waitForFunction(
      () =>
        document.getElementById("scopes-A").getBoundingClientRect().height < 1,
    );
    const rects = await page
      .locator(".de-pair > .de-panel")
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width };
        }),
      );
    assert.equal(Math.round(rects[0].y), Math.round(rects[1].y));
    assert(rects[1].x > rects[0].x + rects[0].width - 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    checks.push({
      width,
      independentSteps: true,
      independentFolds: true,
      sideBySide: true,
      overflow: false,
    });
    await page.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
