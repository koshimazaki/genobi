import { chooseSelect } from "./lib/choose-select.mjs";
/** Local-only casting/capture regression. Optional owner VRM stays outside outputs. */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = ".local/builder-cast";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER === "bundled" ? undefined : "chrome",
  headless: true,
});
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
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) return r.abort();
      if (u.pathname.startsWith("/api/"))
        return r.request().method() === "GET"
          ? r.fulfill({ json: { jobs: [], sources: [] } })
          : r.abort();
      return r.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/world-builder");
    const app = page.locator(".wb-app");
    const button = (n) => app.getByRole("button", { name: n, exact: true });
    await page.waitForFunction(() => window.directorScene);
    await page.waitForFunction(
      () => !document.querySelector(".wb-console > .wb-primary").disabled,
    );
    await chooseSelect(app.getByLabel("Load preset"), "Acoustic room");
    const before = await page.evaluate(() => window.directorScene.getRecipe());
    for (const asset of ["blob", "pug", "creature"]) {
      await chooseSelect(app.getByLabel("Scene character"), asset);
      if (asset === "creature") {
        await app
          .getByRole("alert")
          .filter({ hasText: /Load the local Creature VRM/ })
          .waitFor();
        await button("Capture take").click();
        await app
          .getByRole("alert")
          .filter({ hasText: /Load the local Creature VRM/ })
          .waitFor();
        if (!process.env.GENOBI_CREATURE_VRM) {
          console.log(
            `SKIP ${name} real VRM: set GENOBI_CREATURE_VRM to the owner file`,
          );
          continue;
        }
        await button("Scene").click();
        const summary = app.getByText("Creature model & motion", {
          exact: true,
        });
        await summary.click();
        await app
          .locator(".s3d-creature input[type=file]")
          .first()
          .setInputFiles(process.env.GENOBI_CREATURE_VRM);
        await app.getByText(/Creature ready/).waitFor({ timeout: 60000 });
      }
      await button("Camera").click();
      await button("Frame character").click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll(".wb-feedback [role=alert]").length === 0,
      );
      const recipe = await page.evaluate(() =>
        window.directorScene.getRecipe(),
      );
      assert.equal(recipe.avatarAsset, asset);
      assert.deepEqual(recipe.objects, before.objects);
      assert.equal(await button("Walk").isEnabled(), true);
      await button("Walk").click();
      await app.locator(".wb-canvas-fit canvas").click();
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(450);
      await page.keyboard.up("KeyW");
      await button("Shot camera").click();
      await page.waitForTimeout(150);
      const walked = await page.evaluate(() =>
        window.directorScene.getRecipe(),
      );
      assert.notDeepEqual(
        walked.avatarPose,
        recipe.avatarPose,
        "Capsule movement saves character position",
      );
      await button("Scene").click();
      await chooseSelect(
        app.getByLabel("Character motion", { exact: true }),
        "walk",
      );
      await button("Play take").click();
      await page.waitForTimeout(200);
      await button("Stop preview").click();
      await page.screenshot({
        path: `${out}/${name}-${asset}.png`,
        fullPage: true,
      });
      await page.evaluate(async () =>
        window.directorScene.configure({
          ...window.directorScene.getRecipe(),
          width: 512,
          height: 320,
          frames: 9,
        }),
      );
      if (asset === "blob")
        await page.evaluate(() => {
          document.documentElement.dataset.theme = "cyberpunk";
        });
      await button("Capture take").click();
      if (asset === "blob")
        await page.evaluate(() => {
          document.documentElement.dataset.theme = "signal";
        });
      await page.waitForFunction(() =>
        document
          .querySelector(".wb-feedback [role=status]")
          .textContent.startsWith("Capture ready"),
      );
      await app.getByText("Export take", { exact: true }).click();
      for (const [label, ext] of [
        ["Video · WebM", "webm"],
        ["Capture receipt", "json"],
      ]) {
        const wait = page.waitForEvent("download");
        await button(label).click();
        await (await wait).saveAs(`${out}/${name}-${asset}.${ext}`);
      }
      const receipt = JSON.parse(
        await readFile(`${out}/${name}-${asset}.json`, "utf8"),
      );
      assert.equal(receipt.recipe.avatarAsset, asset);
      assert.equal(receipt.frameCount, 9);
      if (asset === "blob") {
        assert.equal(receipt.appearance.theme, "cyberpunk");
        assert.equal(receipt.appearance.colour, "#76a9d5");
      } else assert.equal(receipt.appearance, undefined);
      if (asset === "creature")
        assert.match(receipt.recipe.creatureReference.sha256, /^[a-f0-9]{64}$/);
      assert(
        !JSON.stringify(receipt).includes(
          process.env.GENOBI_CREATURE_VRM ?? "/Users/",
        ),
      );
      await page.keyboard.press("Escape");
      console.log(`PASS ${name} ${asset} capture and recipe`);
    }
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
