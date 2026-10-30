/** Settings layout and route choices, using fixture APIs only. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.KEYS_URL ?? "http://127.0.0.1:5487";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const output = ".local/studio-settings";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const hosted of [false, true]) {
    for (const width of [1440, 1024, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.addInitScript(() =>
        localStorage.setItem("genobi-setup-seen-v1", "1"),
      );
      let mode = "cloud";
      let revision = 1;
      const writes = [];
      const errors = [];
      page.on("pageerror", (error) => {
        errors.push(error.message);
        console.log("PAGE ERROR", error.stack);
      });
      await page.route("**/api/**", (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === "/api/arena")
          return route.fulfill({ json: { arenas: [] } });
        if (path === "/api/settings/run-location") {
          if (request.method() === "POST") {
            assert(!hosted);
            mode = request.postDataJSON().location;
            writes.push(mode);
            revision++;
          }
          return route.fulfill({
            json: {
              revision,
              mode,
              location: mode === "both" ? "local" : mode,
              label: "Comfy Cloud",
              source: "session",
              fixed: hosted,
              choices: hosted ? ["cloud"] : ["local", "cloud", "both"],
              local: hosted ? null : { reachable: true, version: "fixture" },
              note: "",
            },
          });
        }
        // No provider, key, install, upload or generation writes leave the browser.
        if (request.method() !== "GET") return route.abort();
        if (path === "/api/health")
          return route.fulfill({
            json: { ok: true, hosted, hasServerKey: false },
          });
        if (path === "/api/keys")
          return hosted
            ? route.fulfill({ status: 404, json: {} })
            : route.fulfill({
                json: {
                  keys: {
                    keychain: true,
                    comfy: { connected: false, revision: 0 },
                    bfl: { connected: false, revision: 0 },
                  },
                },
              });
        if (path === "/api/agent/runners")
          return route.fulfill({ json: { runners: [] } });
        if (path === "/api/history")
          return route.fulfill({ json: { jobs: [], sources: [] } });
        if (path === "/api/chains")
          return route.fulfill({ json: { chains: [] } });
        return route.fulfill({ json: {} });
      });
      await page.goto(`${base}/?workspace=camera`);
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "Studio settings",
        exact: true,
      });
      await dialog.getByLabel("Comfy API key", { exact: true }).waitFor();
      await dialog.locator("fieldset.run-location").waitFor();
      assert.equal(await dialog.locator(".settings-section[open]").count(), 2);
      await page.screenshot({ path: `${output}/current.png` });
      const box = await dialog.boundingBox();
      if (width === 1440)
        assert(
          box.width > 800 && box.height < box.width,
          "desktop settings are landscape",
        );
      assert(
        await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
        `${width}: dialog overflow`,
      );
      if (!hosted) {
        await dialog.getByRole("radio", { name: "Both", exact: true }).check();
        await page.waitForFunction(
          () => document.querySelector('input[value="both"]')?.checked,
        );
        await dialog
          .locator('fieldset.run-location[aria-busy="false"]')
          .waitFor();
        assert.deepEqual(writes, ["both"]);
      } else {
        assert(
          await dialog
            .getByRole("radio", { name: "Comfy Cloud", exact: true })
            .isDisabled(),
        );
        assert.equal(
          await dialog
            .getByRole("radio", { name: "Both", exact: true })
            .count(),
          0,
        );
      }
      await page.screenshot({
        path: `${output}/${hosted ? "hosted" : "local"}-${width}.png`,
      });
      for (const title of [
        "Agents & studio connection",
        "Activity & display",
      ]) {
        const section = dialog
          .locator(".settings-section")
          .filter({ has: page.locator("summary strong", { hasText: title }) });
        await section.locator("summary").click();
        assert(await section.evaluate((node) => node.open));
        assert(
          await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
        );
        await section.locator("summary").click();
      }
      await page.keyboard.press("Escape");
      assert(
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .evaluate((node) => node === document.activeElement),
      );
      await page.locator('[data-preset-button="ninja"]').click();
      const ninja = page.locator('[data-preset-button="ninja"]');
      const gear = page.getByRole("button", {
        name: "Configure Ninja",
        exact: true,
      });
      await gear.waitFor({ timeout: 5000 }).catch(async (error) => {
        console.log({
          errors,
          url: page.url(),
          gear: await page.locator(".genobi-config-button").count(),
          shell: await page.locator(".genobi-shell").count(),
        });
        await page.screenshot({ path: `${output}/failure.png` });
        throw error;
      });
      const [n, g] = await Promise.all([
        ninja.boundingBox(),
        gear.boundingBox(),
      ]);
      assert(
        Math.abs(n.y + n.height / 2 - g.y - g.height / 2) < 2,
        `${width}: gear shares Ninja baseline`,
      );
      assert(
        g.x - n.x - n.width >= 0 && g.x - n.x - n.width <= 8,
        `${width}: gear is beside Ninja`,
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width}: page overflow`,
      );
      const before = await gear.getAttribute("aria-pressed");
      await gear.click();
      assert.notEqual(await gear.getAttribute("aria-pressed"), before);
      if (!hosted)
        await page.screenshot({ path: `${output}/ninja-${width}.png` });
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${hosted ? "hosted" : "local"} ${width}: settings sections, routing, focus, overflow and Ninja alignment`,
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
