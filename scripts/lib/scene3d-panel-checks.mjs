import { chooseSelect } from "./choose-select.mjs";
/**
 * Panel checks for `scripts/check-3d-tab.mjs`: the Ninja layouts (latch and
 * a four-column column at 1150 px), a forced WebGL context loss, and Space
 * on the camera panel's buttons beside a ready World Builder.
 */
import assert from "node:assert/strict";
import { overflow } from "./a11y-audit.mjs";
import { loadNinja, radarInk, sceneCanvas } from "./scene3d-check.mjs";

export async function panelChecks({ open, base, pass, output }) {
  // Ninja: removing the panel from the layout only hides it; its scene,
  // plate and gestures survive being added back.
  {
    const { context, page, errors } = await open({ width: 1440, height: 1000 });
    try {
      await page.goto(`${base}/?workspace=ninja`);
      const load = (panels) => loadNinja(page, panels);
      await load([{ id: "plates", width: "full" }]);
      await sceneCanvas(page).waitFor();
      await chooseSelect(
        page.locator(".s3d-scene-picker select"),
        "acoustic-room",
      );
      await page.locator('[data-plate="crane-up"]').click();
      await page.getByRole("button", { name: /^Rise/ }).click();
      await load([{ id: "project", width: "half" }]);
      await page.waitForTimeout(900);
      assert(!(await sceneCanvas(page).isVisible()), "panel hidden");
      assert.equal(
        await page.locator("[data-plate]").count(),
        10,
        "still mounted",
      );
      await load([{ id: "plates", width: "full" }]);
      await sceneCanvas(page).waitFor();
      assert.equal(
        await page.locator(".s3d-scene-picker select").inputValue(),
        "acoustic-room",
      );
      assert.equal(
        await page
          .locator('[data-plate="crane-up"]')
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        await page
          .getByRole("button", { name: /^Rise/ })
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.deepEqual(errors, []);
      pass(
        "Ninja: removing and re-adding 3D camera keeps its scene, plate and gestures",
      );
    } finally {
      await context.close();
    }
  }

  // A narrow Ninja column at a desktop width: the panel collapses on its own
  // width, the radar panes keep a drawable size, and nothing throws.
  {
    const { context, page, errors } = await open({ width: 1150, height: 900 });
    try {
      await page.goto(`${base}/?workspace=ninja`);
      await loadNinja(page, [
        { id: "plates", width: "half", columns: 4 },
        { id: "project", width: "half", columns: 4 },
        { id: "inspirations", width: "half", columns: 4 },
      ]);
      await sceneCanvas(page).waitFor();
      await page.locator('[data-plate="wide-orbit"]').click();
      await page.waitForTimeout(1500);
      const layout = await page.evaluate(() => ({
        panel: document.querySelector('[data-panel="plates"]').clientWidth,
        tracks: getComputedStyle(
          document.querySelector(".s3d"),
        ).gridTemplateColumns.split(" ").length,
        radar: [...document.querySelectorAll(".s3d-radar canvas")].map(
          (c) => c.clientWidth,
        ),
      }));
      assert(layout.panel < 500, `a four-column panel, not ${layout.panel} px`);
      assert.equal(layout.tracks, 1, "the panel collapsed to one column");
      for (const width of layout.radar)
        assert(width >= 48, `radar pane ${width} px wide`);
      assert((await radarInk(page, "Top view of the camera path")).ink > 300);
      assert.deepEqual(await overflow(page), []);
      assert.deepEqual(errors, []);
      pass(
        `1150 px Ninja, four columns: ${layout.panel} px panel in one column, radar drawn, no errors`,
      );
    } finally {
      await context.close();
    }
  }

  // A lost WebGL context shows the message in the frame, not a blank canvas.
  {
    const { context, page } = await open({ width: 1440, height: 1000 });
    try {
      await page.goto(`${base}/?workspace=world`);
      await sceneCanvas(page).waitFor();
      await page.waitForTimeout(800);
      const frame = () =>
        page.locator(".s3d-canvas").evaluate((e) => {
          const r = e.getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.height)];
        });
      const before = await frame();
      await sceneCanvas(page).evaluate((canvas) =>
        (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
          .getExtension("WEBGL_lose_context")
          .loseContext(),
      );
      const message = page.getByText("3D preview unavailable in this browser.");
      await message.waitFor();
      assert(await message.isVisible(), "message visible");
      assert.equal(
        await page
          .locator(".s3d-canvas canvas")
          .evaluate((c) => getComputedStyle(c).display),
        "none",
      );
      assert.deepEqual(await frame(), before, "the frame keeps its size");
      await page.locator('[data-panel="plates"]').screenshot({
        path: `${output}/context-lost.png`,
      });
      pass("A lost WebGL context shows the message in place of the canvas");
    } finally {
      await context.close();
    }
  }

  // Space on a focused camera-panel button activates that button; World
  // Builder's Space shortcut stays on its own surface (and the empty page).
  {
    const { context, page, errors } = await open({ width: 1440, height: 1000 });
    try {
      await page.goto(`${base}/?workspace=world`);
      await sceneCanvas(page).waitFor();
      const take = page.getByRole("button", { name: "Play take" });
      await page.waitForFunction(
        () => !document.querySelector('[aria-label="Play take"]')?.disabled,
      );
      const plate = page.locator('[data-plate="crane-up"]');
      await plate.focus();
      await page.keyboard.press("Space");
      await page.waitForTimeout(300);
      assert.equal(await plate.getAttribute("aria-pressed"), "true");
      assert(await take.isVisible(), "World Builder did not start playing");
      const play = page.locator(".s3d-transport button");
      // Let the picked plate finish so Play starts from rest.
      await page.waitForFunction(
        () =>
          document
            .querySelector(".s3d-transport button")
            ?.getAttribute("aria-pressed") === "false",
        null,
        { timeout: 10_000 },
      );
      await play.focus();
      await page.keyboard.press("Space");
      await page.waitForTimeout(200);
      assert.equal(await play.getAttribute("aria-pressed"), "true");
      assert(await take.isVisible(), "World Builder still idle");
      // With nothing focused, Space still plays the World Builder take.
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Space");
      await page.getByRole("button", { name: "Stop preview" }).waitFor();
      await page.keyboard.press("Space");
      await take.waitFor();
      assert.deepEqual(errors, []);
      pass(
        "Space activates the focused plate and Play; World Builder's Space stays on its own surface",
      );
    } finally {
      await context.close();
    }
  }
}
