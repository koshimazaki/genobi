/** Local-only Scrolls regression: readable direction rows and reachable tracks. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { overflow } from "./lib/a11y-audit.mjs";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5396";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".local/scrolls-layout";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: width === 390,
    });
    // Onboarding has its own fixture suite; check Scrolls after dismissal.
    await context.addInitScript(() =>
      localStorage.setItem("genobi-setup-seen-v1", "1"),
    );
    await context.route("**/api/**", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: { jobs: [], sources: [] } })
        : route.abort(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/scrolls`);
    await page.getByLabel("Scroll title", { exact: true }).waitFor();
    await page.getByText("Document & agent tools", { exact: true }).click();
    for (const count of [1, 8, 16]) {
      await page
        .getByLabel("Scrolls command JSON")
        .fill(JSON.stringify({ op: "resize", count }));
      await page
        .getByRole("button", { name: "Apply command", exact: true })
        .click();
      const last = page.getByRole("button", {
        name: `Edit camera for cell ${count}`,
        exact: true,
      });
      await last.waitFor();
      await page.waitForFunction(
        (expected) =>
          document.querySelectorAll(
            ".scroll-movement .scroll-direction-trigger",
          ).length === expected,
        count * 2,
      );
      const sizes = await page
        .locator(".scroll-movement .scroll-direction-trigger")
        .evaluateAll((buttons) =>
          buttons.map((b) => ({
            width: b.getBoundingClientRect().width,
            height: b.getBoundingClientRect().height,
          })),
        );
      assert.equal(sizes.length, count * 2);
      assert(
        sizes.every((s) => s.width >= 99 && s.height >= 44),
        `${width}px / ${count} cells: direction controls squeezed`,
      );
      await last.click();
      const cameraMenu = page.getByRole("dialog", {
        name: "Camera direction",
        exact: true,
      });
      await cameraMenu
        .getByRole("button", { name: "Track right", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: `Edit action for cell ${count}`,
          exact: true,
        })
        .click();
      const actionMenu = page.getByRole("dialog", {
        name: "Character action",
        exact: true,
      });
      await actionMenu
        .getByRole("button", { name: "Run", exact: true })
        .click();
      assert.match(await last.innerText(), /Track right/);
      assert.deepEqual(await overflow(page), []);
      await page.getByLabel("Time to audio", { exact: true }).check();
      const tracks = page.getByRole("region", {
        name: "Scrollable storyboard tracks",
      });
      await tracks.waitFor();
      await tracks.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      const final = page
        .locator('[data-kind="camera"].scroll-timeline-clip')
        .last();
      await final.focus();
      const box = await final.boundingBox(),
        trackBox = await tracks.boundingBox();
      assert(
        box && trackBox && box.x + box.width <= trackBox.x + trackBox.width + 1,
        "Last timeline cell must be reachable",
      );
      assert.deepEqual(await overflow(page), []);
      await page.screenshot({
        path: `${output}/${width}-${count}.png`,
        fullPage: true,
      });
      await page.getByLabel("Time to audio", { exact: true }).uncheck();
      console.log(
        `PASS Scrolls ${width}px / ${count} cells: controls, edits, tracks, overflow`,
      );
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
