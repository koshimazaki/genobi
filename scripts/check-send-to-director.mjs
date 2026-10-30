/**
 * Send to Director and Add to assets, in a browser against a dev server whose
 * API the page answers itself:
 *   DIRECTOR_URL=http://127.0.0.1:5397 node scripts/check-send-to-director.mjs
 * A Scrolls result is sent to the Director's assets without leaving Scrolls,
 * Undo takes it out again, a repeat says it is already there, a library card
 * sends its clip, and a generated Scrolls result lands under Project as it
 * arrives. The quote, submission, job and result are fixtures; nothing paid
 * is contacted.
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { overflow } from "./lib/a11y-audit.mjs";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5397";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".local/send-to-director";
await mkdir(output, { recursive: true });
const png = await readFile("public/scrolls/creature.png");
const result = await readFile("public/scrolls/mecha-one.png").catch(() => png);
const library = {
  id: "library-01",
  label: "Motorbike, slow pan",
  url: "/media/library-01.mp4",
  poster: "/media/library-01.jpg",
  mediaType: "video",
  width: 960,
  height: 528,
  duration: 10.041667,
  origin: "sample",
};
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    await context.addInitScript(() => {
      localStorage.setItem("genobi-setup-seen-v1", "1");
      localStorage.setItem("genobi.startup-guide.v1", "seen");
    });
    const errors = [],
      unexpected = [];
    let job;
    await context.route("**/api/**", (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (path === "/api/quotes" && req.method() === "POST")
        return route.fulfill({
          json: {
            quote: {
              id: "12345678-1234-4123-8123-123456789abc",
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              estimateUsd: 0.009,
            },
          },
        });
      if (path === "/api/jobs" && req.method() === "POST") {
        const input = req.postDataJSON();
        job = {
          ...input,
          id: "fixture-ready",
          prompt: input.description,
          status: "Generating",
          mediaType: "image",
          keyMode: "server",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          costEstimateUsd: 0.009,
        };
        return route.fulfill({ json: { job } });
      }
      if (path === "/api/jobs/fixture-ready")
        return route.fulfill({
          json: {
            job: {
              ...job,
              status: "Ready",
              resultUrl: "/api/clips/fixture-ready",
              resultContentType: "image/png",
            },
          },
        });
      if (path === "/api/clips/fixture-ready")
        return route.fulfill({ body: result, contentType: "image/png" });
      if (req.method() !== "GET") {
        unexpected.push(`${req.method()} ${path}`);
        return route.abort();
      }
      return route.fulfill({ json: { jobs: [], sources: [library] } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/scrolls`);
    await page
      .locator('.scrolls input[type=file][accept^="image/png"]')
      .setInputFiles({
        name: "creature.png",
        mimeType: "image/png",
        buffer: png,
      });
    const card = page.locator(".scroll-result").first();
    await card.waitFor();
    const send = card.getByRole("button", {
      name: "Send to Director",
      exact: true,
    });
    const status = card.locator(".send-director-status").first();
    await send.click();
    await status
      .filter({ hasText: "Added to the Director's assets · Project." })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/scrolls");
    assert(await page.locator(".scrolls").isVisible(), "Scrolls stays open");
    const projectAsset = page
      .locator(".genobi-project-asset")
      .filter({ hasText: "creature" });
    assert.equal(await projectAsset.count(), 1, "the rail shows the asset");
    await page.screenshot({ path: `${output}/${width}-sent.png` });
    await status.getByRole("button", { name: "Undo", exact: true }).click();
    await status.filter({ hasText: "Undone" }).waitFor();
    assert.equal(await projectAsset.count(), 0, "Undo removed it");
    await send.click();
    await status
      .filter({ hasText: "Added to the Director's assets" })
      .waitFor();
    await send.click();
    await status
      .filter({ hasText: "Already in the Director's assets · Project." })
      .waitFor();
    assert.equal(await projectAsset.count(), 1, "a repeat keeps one asset");

    // A library card in the asset rail sends its clip the same way.
    if (!(await page.locator("#studio-assets").isVisible()))
      await page.locator(".studio-assets-toggle").click();
    await page.locator("#assets-tab-gallery").click();
    const libraryCard = page
      .locator("#assets-pane-gallery .clip-card")
      .filter({ hasText: library.label })
      .first();
    const libraryAsset = page
      .locator("#assets-pane-project .genobi-project-asset")
      .filter({ hasText: "library-01.mp4" });
    const before = await page
      .locator("#assets-pane-project .genobi-project-asset")
      .count();
    await libraryCard.getByRole("button", { name: "Send to Director" }).click();
    const libraryStatus = libraryCard.locator(".send-director-status");
    // The rail stays on Library, so the card's answer and Undo stay in view.
    await libraryStatus
      .filter({ hasText: "Added to the Director's assets · Project." })
      .waitFor();
    assert.equal(
      await page.locator("#assets-tab-gallery").getAttribute("aria-selected"),
      "true",
    );
    assert.equal(await libraryAsset.count(), 1, "the clip is in the project");
    const undo = libraryStatus.getByRole("button", {
      name: "Undo",
      exact: true,
    });
    const rail = await page.locator("#studio-assets").boundingBox();
    const box = await undo.boundingBox();
    assert(
      box &&
        box.x >= rail.x &&
        box.x + box.width <= rail.x + rail.width &&
        box.y >= rail.y,
      `Undo lies inside the rail at ${width}px`,
    );
    await page.screenshot({ path: `${output}/${width}-library.png` });
    await undo.click();
    await libraryStatus.filter({ hasText: "Undone" }).waitFor();
    assert.equal(await libraryAsset.count(), 0, "Undo took the clip out");
    assert.equal(
      await page.locator("#assets-pane-project .genobi-project-asset").count(),
      before,
      "the asset count went back",
    );

    // A generated result lands under Project as it arrives.
    await page
      .getByLabel("Describe your scroll")
      .fill("A creature on a rooftop. One illustrated board.");
    await page
      .getByRole("button", { name: "Generate board", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approve & generate", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        /added to project assets · Project\./.test(
          document.querySelector(".scroll-message")?.textContent ?? "",
        ),
      undefined,
      { timeout: 30000 },
    );
    assert.equal(await page.locator(".scroll-result").count(), 2);
    assert.equal(new URL(page.url()).pathname, "/scrolls");
    await page.screenshot({ path: `${output}/${width}-landed.png` });
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(await overflow(page), []);
    console.log(
      `PASS Send to Director ${width}px: Scrolls result sent, undone, repeated; library clip sent and undone inside the rail; generated result landed in Project; Director not opened; no paid calls`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
