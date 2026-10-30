/**
 * The Director's project prompt as fields, with references you can see
 * (the setup design, Box 2.8), at 1440 and 390 px, empty and with
 * the anime teaser's brief. The API is stubbed and every POST aborted, so
 * nothing is generated. Start Vite first, then:
 *
 *   npx vite --port 5391 --strictPort --host 127.0.0.1
 *   DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-director-brief.mjs
 *
 * Checks: the preset toolbar and stage stay put between empty and populated;
 * the fields are no taller than the same lines drawn plain (the old wall),
 * so the field layout alone moves nothing below; labels, swatches and tiles
 * render; click still opens the swap menu, double-click opens the lightbox;
 * typing in a field and dropping a file on a tile reach the downloaded brief.
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const out = process.env.STUDIO_EVIDENCE ?? ".local/director-brief";
await mkdir(out, { recursive: true });
const png = [
  ...(await readFile("docs/director-bundle/templates/poster-motion.png")),
];
// The same lines as the editor before Box 2.8: plain text at the surface's
// line height, 25 px round chips. Fields must not be taller than this.
const PLAIN = `
.prompt-line, .prompt-line[data-field], .prompt-line[data-field="header"],
.prompt-line[data-field="title"] { margin: 0 !important; padding: 0 !important;
  border: 0 !important; line-height: inherit !important; font: inherit !important;
  letter-spacing: normal !important; text-transform: none !important; }
.prompt-field-label { all: unset !important; }
.prompt-swatch { display: none !important; }
.prompt-hex { font: inherit !important; }
.prompt-line[data-tiles] .prompt-inline-reference { display: inline-flex !important;
  padding: 3px 8px 3px 3px !important; margin: 2px 3px 2px 0 !important; }
.dir-remix .prompt-inline-reference > :is(img, video, .prompt-font-sample, .dir-asset-placeholder) {
  width: 25px !important; height: 25px !important; }`;

const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
const errors = [];
try {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      acceptDownloads: true,
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() =>
      localStorage.setItem("genobi.startup-guide.v1", "seen"),
    );
    await page.route("**/api/**", (route) =>
      route.request().method() !== "GET"
        ? route.abort()
        : route.fulfill({
            json:
              new URL(route.request().url()).pathname === "/api/health"
                ? { hasServerKey: false }
                : { jobs: [], sources: [] },
          }),
    );
    const box = (selector) =>
      page
        .locator(selector)
        .first()
        .evaluate((e) => {
          const r = e.getBoundingClientRect();
          return [r.x, r.y + scrollY, r.width, r.height].map(Math.round);
        });
    const open = async (query) => {
      await page.goto(`${base}/director${query}`);
      await page
        .getByText("Ready · local preview", { exact: true })
        .waitFor({ timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
    };
    const fixed = async () => ({
      presets: await box(".genobi-presets"),
      stage: await box('canvas[aria-label="Director preview"]'),
    });

    await open("");
    const empty = await fixed();
    await page.screenshot({
      path: `${out}/${width}-empty.png`,
      fullPage: true,
    });

    await open("?example=anime-teaser");
    assert.deepEqual(await fixed(), empty, `${width}: toolbar or stage moved`);
    const surface = page.locator(".prompt-text-surface");
    assert.deepEqual(
      await page
        .locator(".prompt-line")
        .evaluateAll((lines) => lines.map((l) => l.dataset.field ?? "")),
      [
        "header",
        "subject",
        "title",
        "look",
        "lighting",
        "palette",
        "negative",
        "shots",
        "references",
      ],
    );
    assert.equal(await page.locator(".prompt-swatch").count(), 4);
    assert.equal(
      await page.locator(".prompt-line[data-tiles] [data-prompt-ref]").count(),
      2,
    );
    const label = await page
      .locator('.prompt-line[data-field="look"] .prompt-field-label')
      .evaluate((e) => getComputedStyle(e).color);
    const body = await page
      .locator('.prompt-line[data-field="look"]')
      .evaluate((e) => getComputedStyle(e).color);
    assert.notEqual(label, body, "the field label is not coloured");
    const tile = await box(".prompt-line[data-tiles] [data-prompt-ref] > *");
    assert(tile[2] >= 80 && tile[3] >= 60, `tile thumbnail is ${tile}`);
    const fields = (await surface.boundingBox()).height;
    const style = await page.addStyleTag({ content: PLAIN });
    const plain = (await surface.boundingBox()).height;
    await style.evaluate((e) => e.remove());
    assert(
      fields <= plain,
      `${width}: fields ${fields}px are taller than plain lines ${plain}px`,
    );
    await page.screenshot({
      path: `${out}/${width}-anime.png`,
      fullPage: true,
    });
    console.log(
      `PASS ${width}: toolbar and stage still; fields ${Math.round(fields)} px ≤ plain ${Math.round(plain)} px; labels, swatches and ${tile[2]}×${tile[3]} tiles`,
    );

    // Click keeps the swap menu; double-click opens the lightbox instead.
    const chip = page.getByRole("button", { name: "Change Image 1" });
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await page.locator(".prompt-asset-picker").waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".prompt-asset-picker").waitFor({ state: "detached" });
    await chip.dblclick();
    const lightbox = page.getByRole("dialog", { name: "Image 1" });
    const large = lightbox.locator("img.still-image");
    await large.waitFor();
    await page.waitForFunction(
      () => document.querySelector("dialog img.still-image")?.complete,
    );
    const shown = await large.boundingBox();
    assert(shown.width >= 300, `lightbox image is ${shown.width}px wide`);
    assert.equal(await page.locator(".prompt-asset-picker").count(), 0);
    await page.screenshot({ path: `${out}/${width}-lightbox.png` });
    await page.keyboard.press("Escape");
    await lightbox.waitFor({ state: "detached" });
    console.log(`PASS ${width}: click swaps, double-click opens the lightbox`);

    // Typing in a field body keeps the words the agent receives.
    const title = page.locator('.prompt-line[data-field="title"]');
    await title.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" II");
    // A new line redraws the fields and keeps the caret where it was typed.
    await page.keyboard.press("Enter");
    await page.keyboard.type("Mood: calm");
    const brief = async () => {
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download brief + files", exact: true })
        .click();
      const file = await (await download).path();
      return JSON.parse(
        strFromU8(unzipSync(await readFile(file))["brief.json"]),
      );
    };
    const before = await brief();
    assert.match(before.prompt, /\nTitle: FIRE FIST II\nMood: calm\nLook: /);
    const mood = page.locator('.prompt-line[data-field="other"]');
    assert.equal(await mood.textContent(), "Mood: calm");
    assert.equal(
      await mood.locator(".prompt-field-label").textContent(),
      "Mood:",
    );

    // A file dropped on a tile replaces that reference's file in place.
    await chip.evaluate((el, bytes) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array(bytes)], "poster.png", { type: "image/png" }),
      );
      for (const type of ["dragover", "drop"])
        el.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: data,
          }),
        );
    }, png);
    await page.waitForFunction(
      () => !document.querySelector(".prompt-text-surface[aria-disabled=true]"),
    );
    await page.waitForTimeout(300);
    const after = await brief();
    const ref = (b) => b.references.find((r) => r.label === "Image 1");
    assert.notEqual(ref(after).sha256, ref(before).sha256, "drop did not swap");
    assert.equal(after.prompt, before.prompt, "a drop changed the words");
    console.log(`PASS ${width}: typing and a tile drop reach the brief`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
