import { chooseSelect } from "./lib/choose-select.mjs";
/** Local-only regression for the unified 3D workspace. No provider requests. */
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { targets } from "./lib/a11y-audit.mjs";
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = ".local/3d-workspace";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER === "bundled" ? undefined : "chrome",
  headless: true,
});
const report = [];
async function download(page, button, name) {
  const pending = page.waitForEvent("download");
  await button.click();
  await (await pending).saveAs(`${out}/${name}`);
}
async function recipe(page) {
  return page.evaluate(() => window.directorScene.getRecipe());
}
async function configure(page, patch) {
  await page.evaluate(
    async (patch) =>
      window.directorScene.configure({
        ...window.directorScene.getRecipe(),
        ...patch,
      }),
    patch,
  );
}
async function noOverflow(page) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Page must not overflow",
  );
}
try {
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 1000 },
    phone: { width: 390, height: 844 },
  })) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() =>
      localStorage.setItem("genobi-setup-seen-v1", "1"),
    );
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname.startsWith("/api/"))
        return route.request().method() === "GET"
          ? route.fulfill({ json: { jobs: [], sources: [] } })
          : route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/world-builder`);
    const app = page.locator(".wb-app");
    const button = (name) => app.getByRole("button", { name, exact: true });
    // Panel launchers are multi-select toggles: open one without closing it.
    const show = async (name) => {
      const launcher = button(name);
      if ((await launcher.getAttribute("aria-pressed")) !== "true")
        await launcher.click();
    };
    await page.waitForFunction(() => window.directorScene);
    await button("Capture take").waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".wb-console > .wb-primary").disabled,
    );
    assert.equal(
      await page.locator(".genobi-grid canvas:visible").count(),
      1,
      "One default rendering surface",
    );
    await noOverflow(page);
    if (name === "phone") assert.deepEqual(await targets(page), []);
    await chooseSelect(app.getByLabel("Load preset"), "Acoustic room");
    await page.waitForFunction(
      // Four room planes and the two reactive test objects.
      () => window.directorScene.getRecipe().objects.length === 6,
    );
    await chooseSelect(app.getByLabel("Scene character"), "mannequin");
    await button("Build").click();
    // The primitives chooser beside Add: Escape (focus on Add, or wherever a
    // placement left it) and a press outside both close it.
    const picker = app.getByRole("group", { name: "Primitives" });
    await button("Add primitive").click();
    await picker.waitFor();
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "detached" });
    assert.equal(
      await button("Add primitive").evaluate(
        (el) => document.activeElement === el,
      ),
      true,
      "Escape returns focus to Add",
    );
    await button("Add primitive").click();
    await picker.waitFor();
    await app.locator(".wb-workspace-bar h1").click();
    await picker.waitFor({ state: "detached" });
    await button("Add primitive").click();
    await button("Cube").click();
    await page.waitForFunction(
      () => window.directorScene.getRecipe().objects.length === 7,
    );
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "detached" });
    await app.getByLabel("Position X", { exact: true }).fill("1.5");
    await app.getByLabel("Position X", { exact: true }).blur();
    const authored = await recipe(page);
    assert.equal(authored.objects.length, 7);
    assert.equal(authored.objects.at(-1).x, 1.5);
    await show("Camera");
    await chooseSelect(app.getByLabel("Camera move", { exact: true }), "front");
    await page.waitForFunction(
      () => window.directorScene.getRecipe().cameraShot === "front",
    );
    const after = await recipe(page);
    assert.deepEqual(after.objects, authored.objects);
    assert.deepEqual(after.avatarPose, authored.avatarPose);
    assert.equal(after.avatar, true);
    if (name === "phone") assert.deepEqual(await targets(page), []);
    await page.screenshot({
      path: `${out}/${name}-camera.png`,
      fullPage: true,
    });
    const canvas = await app.locator(".wb-canvas-fit").boundingBox();
    const inspector = await app.locator("#wb-inspector").boundingBox();
    assert(
      name === "phone"
        ? inspector.y >= canvas.y + canvas.height
        : inspector.x >= canvas.x + canvas.width,
      "Inspector must not cover the scene",
    );
    assert(
      (await app.locator("#wb-inspector .wb-dock-slot").count()) <= 2,
      "At most two panels dock",
    );
    await page.keyboard.press("Escape");
    assert.equal(await button("Camera").getAttribute("aria-pressed"), "false");
    assert.equal(
      await button("Camera").evaluate((el) => document.activeElement === el),
      true,
      "Escape closes the focused panel and returns focus to its launcher",
    );
    await show("Sound");
    await app.getByText("Mod matrix", { exact: true }).click();
    // Route 1 of a room is the sphere's height route.
    await chooseSelect(app.getByLabel("Route 1 property"), "scale");
    // The Genobi footer deck, opened, renders in front of the docked panels
    // where they meet (on a phone the Sound panel reaches under it).
    const deckBar = page.locator(".genobi-deck .deck-bar");
    await deckBar.click();
    const deck = await page.evaluate(() => {
      const body = document.querySelector(".deck-body").getBoundingClientRect();
      const panel = document
        .querySelector("#wb-inspector")
        .getBoundingClientRect();
      const x0 = Math.max(body.left, panel.left),
        x1 = Math.min(body.right, panel.right),
        y0 = Math.max(body.top, panel.top),
        y1 = Math.min(body.bottom, panel.bottom);
      if (x1 <= x0 || y1 <= y0) return { overlap: false };
      const hit = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
      return { overlap: true, front: !!hit?.closest(".genobi-deck") };
    });
    if (name === "phone") assert(deck.overlap, "The deck and panels meet");
    assert(
      !deck.overlap || deck.front,
      "The Genobi deck must render in front of the docked panels",
    );
    await deckBar.click();
    // Overlays that sat above the deck stay above it: the narrow asset rail
    // (fixed below 1100 px) and Regenerate's popover, which reaches 16 px
    // from the window's foot. The popover is a stand-in with its class.
    const overDeck = (selector) =>
      page.evaluate((selector) => {
        const bar = document
          .querySelector(".genobi-deck .deck-bar")
          .getBoundingClientRect();
        const el = document.querySelector(selector);
        if (!el) return "missing";
        const r = el.getBoundingClientRect();
        const x0 = Math.max(bar.left, r.left),
          x1 = Math.min(bar.right, r.right),
          y0 = Math.max(bar.top, r.top),
          y1 = Math.min(bar.bottom, r.bottom);
        if (x1 <= x0 || y1 <= y0) return "apart";
        const hit = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
        return el.contains(hit) ? "above" : "below";
      }, selector);
    if (name === "phone") {
      const assets = page.locator(".studio-assets-toggle");
      await assets.click();
      // A full rail reaches its max height, over the deck's corner.
      await page.evaluate(() => {
        const rail = document.querySelector(".studio-asset-rail");
        rail.style.height = getComputedStyle(rail).maxHeight;
      });
      assert.equal(
        await overDeck(".studio-asset-rail"),
        "above",
        "The narrow asset rail stays above the Genobi deck",
      );
      await page.evaluate(() =>
        document
          .querySelector(".studio-asset-rail")
          .style.removeProperty("height"),
      );
      await assets.click();
    }
    await page.evaluate(() => {
      const pop = document.createElement("div");
      pop.className = "dir-regenerate-pop wb-probe-pop";
      pop.style.cssText =
        "position:fixed;left:0;right:0;bottom:16px;height:160px";
      document.body.append(pop);
    });
    assert.equal(
      await page.evaluate(
        () => getComputedStyle(document.querySelector(".wb-probe-pop")).zIndex,
      ),
      "66",
      "Regenerate's stylesheet is loaded",
    );
    assert.equal(
      await overDeck(".wb-probe-pop"),
      "above",
      "Regenerate's popover stays above the Genobi deck",
    );
    await page.evaluate(() => document.querySelector(".wb-probe-pop").remove());
    await show("Scene");
    await app.getByText("Recipe & agent controls", { exact: true }).click();
    await button("Inspect JSON").click();
    const saved = JSON.parse(
      await app.getByLabel("Scene recipe JSON").inputValue(),
    );
    await download(page, button("Save recipe"), `${name}-recipe.json`);
    await show("Capture");
    await show("Scene");
    assert.equal(
      JSON.parse(await app.getByLabel("Scene recipe JSON").inputValue())
        .audioRoutes[0].property,
      "scale",
    );
    await app
      .getByLabel("Load recipe", { exact: true })
      .setInputFiles(`${out}/${name}-recipe.json`);
    assert.deepEqual(await recipe(page), saved, "Recipe JSON round trip");
    await noOverflow(page);
    await page.screenshot({ path: `${out}/${name}-scene.png`, fullPage: true });
    // Changing studio sections keeps the same mounted Builder session.
    await page.locator('[data-preset-button="camera"]').click();
    await page.locator('[data-preset-button="world"]').click();
    assert.deepEqual(await recipe(page), saved);
    if (name === "desktop") {
      // A fixed signal exercises the offline decode, scopes, preview and WAV companion.
      const samples = 48000;
      const wav = Buffer.alloc(44 + samples * 2);
      wav.write("RIFF");
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write("WAVEfmt ", 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(48000, 24);
      wav.writeUInt32LE(96000, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36);
      wav.writeUInt32LE(samples * 2, 40);
      for (let i = 0; i < samples; i++)
        wav.writeInt16LE(
          Math.round(Math.sin((i * 440 * 2 * Math.PI) / 48000) * 10000),
          44 + i * 2,
        );
      await show("Sound");
      await app.getByLabel("Audio file").setInputFiles({
        name: "signal.wav",
        mimeType: "audio/wav",
        buffer: wav,
      });
      await page.waitForFunction(
        () => window.directorScene.getRecipe().envelope.length > 0,
      );
      // A picked file plays at once; Play never locks Clear audio.
      await button("Stop").waitFor();
      assert.equal(await button("Clear audio").isEnabled(), true);
      await button("Stop").click();
      await button("Play").click();
      await button("Stop").click();
      for (const [aspect, width, height] of [
        ["landscape", 1280, 704],
        ["portrait", 704, 1280],
        ["square", 1024, 1024],
      ]) {
        await configure(page, { width, height, frames: 9 });
        await show("Capture");
        const fit = await app.locator(".wb-canvas-fit").boundingBox();
        const viewport = await app.locator(".wb-viewport").boundingBox();
        assert(
          fit.y >= viewport.y - 1 &&
            fit.y + fit.height <= viewport.y + viewport.height + 1,
          "Whole capture frame fits inside viewport",
        );
        const frameHash = await page.evaluate(async () => {
          const blob = await window.directorScene.snapshot();
          return Array.from(
            new Uint8Array(
              await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
            ),
            (n) => n.toString(16).padStart(2, "0"),
          ).join("");
        });
        await button("Capture take").first().click();
        await page.waitForFunction(() =>
          document
            .querySelector('.wb-feedback [role="status"]')
            .textContent.startsWith("Capture ready"),
        );
        await app.getByText("Export take", { exact: true }).click();
        await download(page, button("Video · WebM"), `${aspect}.webm`);
        await download(page, button("First frame"), `${aspect}.png`);
        await download(page, button("Capture receipt"), `${aspect}.json`);
        if (aspect === "landscape")
          await download(page, button("Matching audio · WAV"), "landscape.wav");
        const receipt = JSON.parse(
          await readFile(`${out}/${aspect}.json`, "utf8"),
        );
        assert.equal(receipt.recipe.width, width);
        assert.equal(receipt.recipe.height, height);
        assert.equal(receipt.frameCount, 9);
        assert.equal(
          receipt.sha256.first,
          frameHash,
          "Export starts at the exact preview frame",
        );
        await page.screenshot({
          path: `${out}/${aspect}-capture.png`,
          fullPage: true,
        });
        // Next loop reopens Capture whatever else is docked.
      }
      await configure(page, { frames: 241 });
      await show("Capture");
      await button("Capture take").first().click();
      await button("Cancel capture").waitFor();
      assert.equal(
        await app
          .getByRole("button", { name: "9:16", exact: true })
          .isEnabled(),
        false,
      );
      await button("Cancel capture").click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Capture cancelled" })
        .waitFor();
      await configure(page, {
        frames: 9,
        textures: { "screen/all": { name: "missing.png", type: "image" } },
      });
      await button("Capture take").first().click();
      await page
        .getByRole("alert")
        .filter({ hasText: /reattach/i })
        .waitFor();
      await configure(page, { textures: {} });
    }
    await noOverflow(page);
    assert.deepEqual(errors, []);
    report.push({
      viewport: name,
      result: "PASS",
      scene: "Acoustic room",
      checks: [
        "one viewer",
        "menus",
        "primitive edits",
        "camera preserves set",
        "dock framing",
        "two docked panels",
        "Escape focus",
        "sound routing",
        "recipe round trip",
        "studio persistence",
        ...(name === "desktop"
          ? [
              "audio decode/play",
              "3 capture aspects",
              "WAV companion",
              "cancel and format lock",
              "missing media error",
            ]
          : []),
      ],
    });
    console.log(`PASS ${name}`);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
