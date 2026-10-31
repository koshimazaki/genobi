/**
 * The World Builder Capture panel, docked and popped out, at desktop and
 * phone widths, against a local server:
 * DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-world-capture-panel.mjs
 *
 * Checks the status badge (ARMED → REC → READY), aspect tiles and custom
 * size snapping, the duration bank on the 8k + 1 grid, that nothing in the
 * panel overflows it or the page, and screenshots each state into
 * .local/world-capture-panel. No provider request leaves the browser.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = ".local/world-capture-panel";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER === "bundled" ? undefined : "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

/** Every element of the panel lies within it, and the page does not scroll sideways. */
async function noOverflow(page, root) {
  const bad = await page.evaluate((selector) => {
    const panel = document.querySelector(selector);
    if (!panel) return ["no panel"];
    const box = panel.getBoundingClientRect();
    const wide = document.documentElement.scrollWidth > innerWidth;
    if (box.right > innerWidth + 1) return ["panel wider than its window"];
    return [
      ...(wide ? ["page scrolls sideways"] : []),
      ...[...panel.querySelectorAll("*")]
        .filter((el) => el.getClientRects().length)
        .filter(
          (el) =>
            el.getBoundingClientRect().right >
            Math.min(box.right, innerWidth) + 1,
        )
        .map((el) => `${el.tagName}.${el.className} past the panel`),
    ];
  }, root);
  assert.deepEqual(bad, [], "Capture panel overflow");
}
const recipe = (page) => page.evaluate(() => window.directorScene.getRecipe());

/** Labels may wrap at spaces, but an export action must not split its words. */
async function readableExports(panel) {
  const buttons = panel.locator(".wb-capture-export > button");
  assert((await buttons.count()) >= 3, "Export actions are present");
  const broken = await buttons.evaluateAll((buttons) =>
    buttons.flatMap((button) => {
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      const words = [];
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        for (const match of text.textContent.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(text, match.index);
          range.setEnd(text, match.index + match[0].length);
          const lines = new Set(
            [...range.getClientRects()].map((r) => Math.round(r.top)),
          );
          if (lines.size > 1) words.push(match[0]);
        }
      }
      return words.map((word) => `${button.textContent.trim()}: ${word}`);
    }),
  );
  assert.deepEqual(broken, [], "Export labels wrap only between words");
}

const report = [];
try {
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 1000 },
    phone: { width: 390, height: 844 },
  })) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      acceptDownloads: true,
    });
    await context.addInitScript(() =>
      localStorage.setItem("genobi-setup-seen-v1", "1"),
    );
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === new URL(base).origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/world-builder`);
    await page.waitForFunction(() => window.directorScene);
    await page.waitForFunction(
      () => !document.querySelector(".wb-console > .wb-primary").disabled,
      null,
      { timeout: 60000 },
    );
    const app = page.locator(".wb-app");
    const panel = app.locator(".wb-capture");
    const button = (label) =>
      panel.getByRole("button", { name: label, exact: true });
    const launcher = app.locator('[data-wb-launcher="capture"]');
    if ((await launcher.getAttribute("aria-pressed")) !== "true")
      await launcher.click();
    await panel.waitFor();
    const badge = panel.locator(".wb-badge[data-tone]");
    assert.equal(await badge.textContent(), "ARMED");

    const settings = panel.getByText("Capture settings", { exact: true });
    assert.equal(await settings.evaluate((el) => el.parentElement.open), false);
    await settings.focus();
    await page.keyboard.press("Enter");
    assert.equal(await settings.evaluate((el) => el.parentElement.open), true);
    await button("1:1").click();
    await page.waitForFunction(
      () => window.directorScene.getRecipe().width === 1024,
    );
    assert.equal(await button("1:1").getAttribute("aria-pressed"), "true");
    await button("Custom size").click();
    await panel.getByLabel("Width").fill("1000");
    await page.waitForFunction(
      () => window.directorScene.getRecipe().width === 1024,
    );
    await panel.getByLabel("Height").fill("700");
    await page.waitForFunction(
      () => window.directorScene.getRecipe().height === 704,
    );
    for (const [sec, frames] of [
      ["10s", 241],
      ["1s", 25],
      ["4s", 97],
    ]) {
      await panel.getByRole("radio", { name: sec, exact: true }).click();
      await page.waitForFunction(
        (f) => window.directorScene.getRecipe().frames === f,
        frames,
      );
      assert.equal(
        await panel
          .getByRole("radio", { name: sec, exact: true })
          .getAttribute("aria-checked"),
        "true",
      );
    }
    await button("16:9").click();
    await page.waitForFunction(
      () => window.directorScene.getRecipe().height === 704,
    );
    const bank = panel.getByRole("radiogroup", { name: "Quick take length" });
    await bank.getByRole("radio", { name: "4s", exact: true }).focus();
    for (const [key, label, frames] of [
      ["ArrowRight", "5s", 121],
      ["End", "10s", 241],
      ["Home", "1s", 25],
      ["ArrowLeft", "10s", 241],
    ]) {
      await page.keyboard.press(key);
      await page.waitForFunction(
        (frames) => window.directorScene.getRecipe().frames === frames,
        frames,
      );
      const selected = bank.getByRole("radio", { name: label, exact: true });
      assert.equal(await selected.getAttribute("aria-checked"), "true");
      assert.equal(
        await selected.evaluate((el) => document.activeElement === el),
        true,
        `${key} selects and focuses ${label}`,
      );
      assert.equal(await bank.locator('[tabindex="0"]').count(), 1);
    }
    await noOverflow(page, ".wb-capture");
    await page.screenshot({ path: `${out}/${name}-docked-armed.png` });

    // A short take: REC while it renders, READY after.
    await panel.getByRole("radio", { name: "1s", exact: true }).click();
    await page.waitForFunction(
      () => window.directorScene.getRecipe().frames === 25,
    );
    await button("Capture take").click();
    await button("Cancel capture").waitFor();
    assert.match(await badge.textContent(), /^REC \d+\/25$/);
    assert.equal(await badge.getAttribute("data-pulse"), "true");
    await page.waitForFunction(
      () =>
        document.querySelector(".wb-capture .wb-badge[data-tone]")
          ?.textContent === "READY · TAKE",
      null,
      { timeout: 180000 },
    );
    await panel.getByText("Export take", { exact: true }).click();
    for (const label of ["Video · WebM", "First frame", "Capture receipt"])
      assert(await button(label).isVisible(), label);
    assert.equal((await recipe(page)).frames, 25);
    await noOverflow(page, ".wb-capture");
    await readableExports(panel);
    await page.screenshot({ path: `${out}/${name}-docked-ready.png` });
    await panel.screenshot({ path: `${out}/${name}-docked-panel.png` });

    // Pop out, where the browser offers a Document Picture-in-Picture window.
    const pop = app.getByRole("button", {
      name: "Pop Capture out into its own window",
      exact: true,
    });
    let popped = "unsupported";
    if (await pop.count()) {
      const opened = context.waitForEvent("page", { timeout: 10000 });
      await pop.click();
      const pip = await opened.catch(() => null);
      if (pip) {
        await pip.locator(".wb-capture").waitFor();
        // The test browser lays the window out at the context's viewport;
        // give it the size the dock asks for (PanelDock's PIP_SIZE).
        await pip.setViewportSize({ width: 380, height: 640 });
        await pip.waitForTimeout(300);
        await noOverflow(pip, ".wb-capture");
        await readableExports(pip.locator(".wb-capture"));
        // Playwright's screenshot waits on the window's copied font faces,
        // which a Picture-in-Picture document never finishes loading.
        const cdp = await context.newCDPSession(pip);
        const shot = await cdp.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: 380, height: 640, scale: 1 },
        });
        await writeFile(`${out}/${name}-popped.png`, shot.data, "base64");
        assert.equal(
          await pip.locator(".wb-capture .wb-badge[data-tone]").textContent(),
          "READY · TAKE",
          "The popped panel is the same live panel",
        );
        popped = "checked";
        await pip.close();
      } else popped = "window not exposed to the test browser";
    }
    assert.deepEqual(errors, []);
    report.push({ viewport: name, result: "PASS", popped });
    console.log(`PASS ${name} (pop out: ${popped})`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(report));
