/** Reproduce reference import, mode switch, removal, overlay edits, the generator's quotes and its stable layout. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { overflow, targets } from "./lib/a11y-audit.mjs";
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5396";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".local/scrolls-workspace";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    // Onboarding has its own fixture suite; check Scrolls after dismissal.
    await context.addInitScript(() =>
      localStorage.setItem("genobi-setup-seen-v1", "1"),
    );
    const quotes = [],
      unexpectedWrites = [],
      errors = [];
    await context.route("**/api/**", (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (path === "/api/quotes" && req.method() === "POST") {
        quotes.push(req.postDataJSON());
        return route.fulfill({
          json: {
            quote: {
              id: "12345678-1234-4123-8123-123456789abc",
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              estimateUsd: 0.09,
            },
          },
        });
      }
      if (req.method() !== "GET") {
        unexpectedWrites.push(path);
        return route.abort();
      }
      return route.fulfill({ json: { jobs: [], sources: [] } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    let confirms = 0;
    page.on("dialog", async (dialog) => {
      confirms++;
      await dialog.dismiss();
    });
    await page.goto(`${base}/scrolls`);
    await page.getByRole("button", { name: "Examples", exact: true }).click();
    assert.equal(
      await page.locator(".scroll-example-grid > button").count(),
      8,
    );
    await page.getByRole("button", { name: /Rooftop Escape/ }).click();
    await page
      .getByRole("button", { name: "Use storyboard plan", exact: true })
      .click();
    const sheet = page.locator(".scroll-sheet-image");
    await sheet.waitFor();
    assert.match(
      await page.getByLabel("Scroll title", { exact: true }).inputValue(),
      /Rooftop Escape/,
    );
    const camera = page.getByRole("button", {
      name: "Edit camera for cell 4",
      exact: true,
    });
    assert.match(await camera.innerText(), /Low pan/);
    const sheetUrl = await sheet.getAttribute("src");
    await page
      .getByRole("button", { name: "Character sheet", exact: true })
      .click();
    assert.equal(await sheet.getAttribute("src"), sheetUrl);
    await page.getByRole("button", { name: "Storyboard", exact: true }).click();
    assert.equal(
      confirms,
      0,
      "Changing purpose must not prompt to discard the scroll",
    );
    const before = await page.locator(".scroll-composer").boundingBox();
    await camera.click();
    const menu = page.getByRole("dialog", {
      name: "Camera direction",
      exact: true,
    });
    await menu.waitFor();
    assert.deepEqual(
      await page.locator(".scroll-composer").boundingBox(),
      before,
      "Opening a direction menu must not reflow the page",
    );
    await page.screenshot({ path: `${output}/${width}-camera-menu.png` });
    if (width === 390) assert.deepEqual(await targets(page), []);
    await page.keyboard.press("Escape");
    assert(await camera.evaluate((el) => document.activeElement === el));
    await camera.click();
    await menu
      .getByRole("button", { name: "Track right", exact: true })
      .click();
    assert.match(await camera.innerText(), /Track right/);
    await page
      .getByRole("button", { name: "Edit action for cell 4", exact: true })
      .click();
    const action = page.getByRole("dialog", {
      name: "Character action",
      exact: true,
    });
    await action
      .getByLabel("Custom direction")
      .fill("Duck, then kick and leap away");
    await action.getByRole("button", { name: "Done", exact: true }).click();
    assert.match(
      await page
        .getByRole("button", { name: "Edit action for cell 4", exact: true })
        .innerText(),
      /Duck, then kick/,
    );
    await page.screenshot({
      path: `${output}/${width}-sheet.png`,
      fullPage: true,
    });
    await page.locator(".scroll-composer").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${width}-prompt.png` });
    await page
      .getByRole("button", { name: "Remove displayed sheet", exact: true })
      .click();
    assert.equal(await sheet.count(), 0);
    assert.equal(await page.locator(".scroll-result").count(), 0);
    assert.match(await camera.innerText(), /Track right/);
    await page
      .getByLabel("Describe your scroll")
      .fill(
        "Two ninjas escape across moonlit rooftops. One illustrated sheet.",
      );
    // The generator: an empty "Like these" row, then a library example as a
    // reference. Neither may move the board or change the composer's height.
    const board = await page.locator(".scroll-workbench").boundingBox();
    const composer = await page.locator(".scroll-composer").boundingBox();
    await page.screenshot({ path: `${output}/${width}-generator-empty.png` });
    const choose = async (label, option) => {
      await page
        .locator(".scroll-composer .select-menu")
        .filter({ hasText: label })
        .locator("button.select-menu__trigger")
        .click();
      await page.getByRole("option", { name: option, exact: true }).click();
    };
    await choose("Add reference", "Example · Sky Gate · eight-shot storyboard");
    await page
      .getByRole("button", { name: /Remove reference Sky Gate/ })
      .waitFor();
    assert.deepEqual(
      await page.locator(".scroll-workbench").boundingBox(),
      board,
      "Adding a reference must not move the board",
    );
    assert.equal(
      (await page.locator(".scroll-composer").boundingBox()).height,
      composer.height,
      "Adding a reference must not resize the composer",
    );
    await page
      .getByRole("alert")
      .filter({ hasText: /open graph takes text only/ })
      .waitFor();
    assert(
      await page
        .getByRole("button", { name: "Generate board", exact: true })
        .isDisabled(),
      "Klein's open graph must refuse references, not switch model",
    );
    await choose("Run", "API · BFL");
    await page.locator(".scroll-prompt-preview > summary").click();
    await page.getByText("No prompt recorded.", { exact: true }).waitFor();
    assert.match(
      await page.locator(".scroll-prompt-preview pre").innerText(),
      /Reference 1: no prompt recorded\.[\s\S]*Camera intention: Track right/,
    );
    await page.screenshot({
      path: `${output}/${width}-generator-populated.png`,
    });
    await page
      .getByRole("button", { name: "Generate board", exact: true })
      .click();
    await page.getByRole("region", { name: "Generation approval" }).waitFor();
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0].generator, "image");
    assert.equal(quotes[0].model, "flux-3-klein-api");
    assert.equal(quotes[0].imageReferences.length, 1);
    assert.match(quotes[0].description, /Camera intention: Track right/);
    assert.match(quotes[0].description, /Duck, then kick and leap away/);
    await page
      .getByRole("button", { name: /Remove reference Sky Gate/ })
      .click();
    await choose("Run", "Open · Comfy");
    await page.getByRole("button", { name: /^Fill panels · 8$/ }).click();
    await page.waitForFunction(() =>
      document
        .querySelector(".scroll-approval")
        ?.textContent.includes("8 images, one per empty panel"),
    );
    assert.equal(quotes.length, 9, "Fill panels quotes each empty panel once");
    assert(
      quotes
        .slice(1)
        .every((q) => /One clean storyboard frame/.test(q.description)),
    );
    await page
      .getByRole("button", { name: "Generate board", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".scroll-approval")
        ?.textContent.includes("One image"),
    );
    assert.equal(quotes.length, 10);
    const quoted = quotes[9];
    // A synthetic in-flight job must protect its scroll from example replacement.
    // These page routes intercept submission and polling; no server is contacted.
    const fakeJob = {
      ...quoted,
      id: "fixture-pending",
      prompt: quoted.description,
      status: "Generating",
      mediaType: "image",
      keyMode: "server",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      costEstimateUsd: 0.09,
    };
    await page.route("**/api/jobs**", (route) =>
      route.fulfill({ json: { job: fakeJob } }),
    );
    await page.route("**/api/history", (route) =>
      route.fulfill({ json: { jobs: [fakeJob], sources: [] } }),
    );
    await page
      .getByRole("button", { name: "Approve & generate", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Generating…", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Examples", exact: true }).click();
    await page.getByRole("button", { name: /Rooftop Escape/ }).click();
    await page
      .getByRole("button", { name: "Use storyboard plan", exact: true })
      .click();
    await page.waitForFunction(() =>
      /Current scroll kept|current generation/i.test(
        document.querySelector(".scroll-message")?.textContent ?? "",
      ),
    );
    assert.equal(
      confirms,
      0,
      "An in-flight scroll must refuse replacement before confirmation",
    );
    assert.match(await camera.innerText(), /Track right/);
    assert.deepEqual(unexpectedWrites, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(await overflow(page), []);
    console.log(
      `PASS Scrolls ${width}px: 8 examples, plan, mode switch, overlays, removal, generator references, board and fill quotes, stable layout; no paid calls`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
