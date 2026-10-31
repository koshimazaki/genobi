/** Local fixture checks for tool identity, common menus and stable workspace edges. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { chooseSelect } from "./lib/choose-select.mjs";
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5496";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const output = ".local/studio-parity";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.DIRECTOR_BROWSER_PATH
    ? { executablePath: process.env.DIRECTOR_BROWSER_PATH }
    : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
async function pageFor(width) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") return route.abort();
    const pathname = new URL(route.request().url()).pathname;
    const fixtures = {
      "/api/health": { ok: true, hosted: false, hasServerKey: true },
      "/api/credits": {
        credits: 2088,
        provider: "comfy",
        checkedAt: "2026-10-26T12:00:00Z",
      },
      "/api/arena": { arenas: [] },
      "/api/history": { jobs: [], sources: [] },
      "/api/chains": { chains: [] },
      "/api/agent/runners": { runners: [] },
      "/api/agent/sessions": { session: null },
      "/api/activity": { enabled: false, events: [] },
    };
    return route.fulfill({ json: fixtures[pathname] ?? {} });
  });
  return { page, errors };
}
try {
  const fixture = await build({
    entryPoints: ["scripts/fixtures/themed-select.tsx"],
    bundle: true,
    format: "esm",
    jsx: "automatic",
    write: false,
    outdir: ".local/control-fixture",
  });
  const files = Object.fromEntries(
    fixture.outputFiles.map((file) => [path.extname(file.path), file.text]),
  );
  const { page: control, errors: controlErrors } = await pageFor(390);
  await control.route("**/__controls", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><head><link rel="stylesheet" href="/__controls.css"></head><body><div id="root"></div><script type="module" src="/__controls.js"></script></body></html>',
    }),
  );
  for (const [ext, content] of Object.entries(files))
    await control.route(`**/__controls${ext}`, (route) =>
      route.fulfill({
        body: content,
        contentType: ext === ".css" ? "text/css" : "text/javascript",
      }),
    );
  await control.goto(`${base}/__controls`);
  await control.getByRole("button", { name: "Fixture choice Alpha" }).click();
  await control.getByRole("option", { name: "Charlie" }).click();
  await control.getByRole("button", { name: "Submit", exact: true }).click();
  assert.equal(await control.locator("output").textContent(), "c");
  await control.getByRole("button", { name: "Reset", exact: true }).click();
  const trigger = control.getByRole("button", { name: "Fixture choice Alpha" });
  await trigger.waitFor();
  await trigger.focus();
  await control.keyboard.press("ArrowDown");
  await control.keyboard.press("ArrowDown");
  await control.keyboard.press("Enter");
  assert(await control.getByRole("listbox").isVisible());
  assert.equal(
    await control
      .getByRole("option", { name: "Blocked" })
      .getAttribute("aria-disabled"),
    "true",
  );
  await control.keyboard.press("ArrowDown");
  await control.keyboard.press("Enter");
  await control
    .getByRole("button", { name: "Fixture choice Charlie" })
    .waitFor();
  await control
    .getByRole("button", { name: "Open modal", exact: true })
    .click();
  await control.getByRole("button", { name: "Dialog choice Alpha" }).click();
  await control.getByRole("option", { name: "Charlie" }).click();
  await control
    .getByRole("button", { name: "Dialog choice Charlie" })
    .waitFor();
  assert.equal(await control.locator("dialog select").inputValue(), "c");
  assert.deepEqual(controlErrors, []);
  await control.close();
  console.log(
    "PASS themed select: form values, reset, keyboard, disabled option and modal interaction",
  );
  for (const width of [1440, 390, 320]) {
    const { page, errors } = await pageFor(width);
    const tools = {
      director: "Director",
      editor: "Editor",
      world: "3D World Builder",
      dual: "Dual Swords",
      scrolls: "Scrolls",
      tools: "Project Tools",
    };
    for (const workspace of ["gallery", "camera", ...Object.keys(tools)]) {
      await page.goto(`${base}/?workspace=${workspace}`);
      if (tools[workspace])
        await page
          .getByRole("heading", {
            level: 1,
            name: tools[workspace],
            exact: true,
          })
          .waitFor();
      if (workspace === "director" || workspace === "editor") {
        const intake = page.getByRole("dialog", {
          name: "Generate my version",
        });
        await intake.waitFor();
        assert(
          await intake.evaluate(
            (panel) => panel.scrollWidth <= panel.clientWidth,
          ),
          `${workspace} ${width}: generation intake fits without horizontal scrolling`,
        );
        await page.screenshot({
          path: `${output}/${width}-${workspace}-intake.png`,
        });
        await intake
          .getByRole("button", { name: "Close Generate my version" })
          .click();
        await intake.waitFor({ state: "detached" });
      }
      if (workspace === "world")
        await page.getByLabel("World Builder scene", { exact: true }).waitFor();
      if (workspace === "camera")
        await page.locator(".composer-toolbar").waitFor();
      await page.waitForTimeout(500);
      if (width === 1440) {
        const toggle = page.getByRole("button", {
          name: "Assets",
          exact: true,
        });
        if ((await toggle.getAttribute("aria-expanded")) !== "true")
          await toggle.click();
        const rail = await page.locator(".studio-asset-rail").boundingBox();
        const first = page
          .locator(
            workspace === "gallery"
              ? ".template-gallery"
              : ".genobi-grid > section:not([hidden])",
          )
          .first();
        const panel = await first.boundingBox();
        assert(
          Math.abs(rail.y - panel.y) <= 1,
          `${workspace}: content and Assets align`,
        );
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${workspace} ${width}: no horizontal overflow`,
      );
      assert(
        await page
          .locator(".genobi-presets")
          .evaluate((nav) => nav.scrollWidth <= nav.clientWidth + 1),
        `${workspace} ${width}: presets fit without a horizontal scroller`,
      );
      assert(
        await page.locator(".topbar").evaluate((bar) => {
          const brand = bar.querySelector(".wordmark").getBoundingClientRect();
          const actions = bar
            .querySelector(".topbar-right")
            .getBoundingClientRect();
          return brand.right <= actions.left || brand.bottom <= actions.top;
        }),
        `${workspace} ${width}: balance and actions do not overlap the brand`,
      );
      assert.equal(await page.locator(".workspace-heading__steps").count(), 0);
      if (width <= 700) {
        const dock = await page.locator(".genobi-presets").boundingBox();
        assert(dock.height <= 52, "mobile tool icons fit in one row");
        if (workspace === "dual") {
          const [a, b] = await page
            .locator(".de-pair > .de-panel")
            .evaluateAll((panels) =>
              panels.map((panel) => {
                const r = panel.getBoundingClientRect();
                return { x: r.x, y: r.y, bottom: r.bottom, right: r.right };
              }),
            );
          assert.equal(a.x, b.x, "both video sources share the left edge");
          assert(b.y >= a.bottom, "phone video sources stack vertically");
          assert(b.right <= width, "second video source is not clipped");
          const heading = await page
            .locator(".de-heading .workspace-heading")
            .boundingBox();
          assert.equal(
            heading.x,
            a.x,
            "Dual Swords heading aligns with its panels",
          );
        }
      }
      if (workspace === "camera") {
        // Camera generates directly: no Fast/Studio switch or Finish at target.
        assert.equal(
          await page.getByRole("group", { name: "Run mode" }).count(),
          0,
        );
        assert.equal(
          await page.getByRole("button", { name: /^Finish at/ }).count(),
          0,
        );
      }
      if (workspace === "world") {
        if (width > 700) {
          const toggle = page.getByRole("button", {
            name: "Assets",
            exact: true,
          });
          for (const open of [true, false]) {
            if (
              ((await toggle.getAttribute("aria-expanded")) === "true") !==
              open
            )
              await toggle.click();
            await page.waitForTimeout(350);
            const [scene, character] = await page
              .locator(".wb-workspace-menus > label")
              .evaluateAll((labels) =>
                labels.map((label) => {
                  const r = label.getBoundingClientRect();
                  return { x: r.x, y: r.y, right: r.right };
                }),
              );
            assert.equal(scene.y, character.y, "3D selectors share a row");
            assert(
              character.x - scene.right <= 24,
              "3D selectors stay adjacent",
            );
            await page.screenshot({
              path: `${output}/${width}-world-assets-${open}.png`,
            });
          }
        }
        await chooseSelect(
          page.getByLabel("Scene character", { exact: true }),
          "mannequin",
        );
        assert.equal(
          await page.evaluate(
            () => window.directorScene.getRecipe().avatarAsset,
          ),
          "mannequin",
        );
        await page.getByRole("button", { name: /^Scene character/ }).click();
        await page.screenshot({ path: `${output}/${width}-3d-menu.png` });
        await page.keyboard.press("Escape");
      }
      await page.screenshot({ path: `${output}/${width}-${workspace}.png` });
    }
    await page.goto(`${base}/?workspace=ninja`);
    await page.locator(".ninja-heading").waitFor();
    await page
      .getByRole("button", { name: "Save layout", exact: true })
      .click();
    await page.locator(".ninja-heading").waitFor({ state: "detached" });
    await page.reload();
    await page
      .getByRole("button", { name: "Configure Ninja", exact: true })
      .waitFor();
    assert.equal(await page.locator(".ninja-heading").count(), 0);
    if (width <= 700)
      assert(
        (await page.locator(".genobi-presets").boundingBox()).height <= 52,
        "Ninja gear fits alongside the mobile tool icons",
      );
    await page
      .getByRole("button", { name: "Configure Ninja", exact: true })
      .click();
    await page.locator(".ninja-heading").waitFor();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `PASS ${width}: tool headings, generation intake, Assets alignment, direct Camera generation, 3D menu and Ninja revisit`,
    );
  }
} finally {
  await browser.close();
}
