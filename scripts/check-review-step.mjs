/** Local fixture check: every model has direct controls, no Fast/Studio switch
 * or automatic upscale offer. A previously saved chain still accepts explicit
 * approval. All API routes are intercepted; this script never submits a job.
 * REVIEW_URL=http://127.0.0.1:4317 node scripts/check-review-step.mjs
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { reviewFixture } from "./lib/review-fixture.mjs";

const base = process.env.REVIEW_URL ?? "http://127.0.0.1:5173";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const output = ".local/review-step";
await mkdir(output, { recursive: true });
const library = JSON.parse(
  await readFile("public/media/gallery.json", "utf8"),
).map((source) => ({ ...source, origin: "sample" }));
const { run, fixture } = reviewFixture(library);

const browser = await chromium.launch({ headless: true });
const checks = [];
const errors = [];

async function open(width, seed) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  const api = fixture();
  seed?.(api);
  await page.route("**/api/**", (route) => api.handle(route));
  page.on("pageerror", (e) => errors.push(`${width}: ${e.message}`));
  // Gallery is the first view; the review step lives in Camera.
  await page.goto(`${base}/?workspace=camera`);
  await page.locator(".composer-toolbar").waitFor();
  return { page, api };
}

const measure = (page) =>
  page.evaluate(() => {
    const box = (s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r && [Math.round(r.top + scrollY), Math.round(r.height)];
    };
    const gallery = document.querySelector(".genobi-panel-gallery, .gallery");
    return {
      hero: box(".genobi-panel-preview"),
      toolbar: box(".composer-toolbar"),
      gallery:
        gallery && Math.round(gallery.getBoundingClientRect().top + scrollY),
    };
  });

async function steady(page, baseline, label) {
  await page.waitForTimeout(300);
  assert.deepEqual(await measure(page), baseline, `${label} moved the layout`);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    `${label} overflows the page`,
  );
}

const review = (page) => page.getByRole("region", { name: "Review step" });
try {
  for (const width of [1440, 390, 320]) {
    const { page } = await open(width);
    for (const [family, model] of [
      ["FLUX", /^FLUX 3 · Text to video$/],
      ["LTX", /^LTX-2\.5 Fast · Text to video$/],
      ["LTX", /^LTX-2\.5 · Open workflow · Text to video$/],
      ["LTX", /^LTX-2\.5 · Acoustic Space$/],
      ["LTX", /^LTX-2\.5 Pro · Text to video$/],
    ]) {
      await page
        .getByRole("button", { name: `${family} models`, exact: true })
        .first()
        .click();
      await page.getByRole("option", { name: model }).click();
      assert.equal(
        await page.getByRole("group", { name: "Run mode" }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: /^Finish at/ }).count(),
        0,
      );
      assert.equal(await review(page).count(), 0, "no automatic upscale offer");
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      checks.push(`${width}px ${model}: no Fast/Studio or automatic upscale`);
    }
    await page.screenshot({
      path: `${output}/${width}-direct-controls.png`,
      fullPage: true,
    });
    await page.close();
  }
  {
    // After a reload: a paused Studio upscale from history, with no record
    // on this page of the draft it continues.
    const { page, api } = await open(1440, (api) =>
      api.create({
        stages: [
          {
            input: {
              ...run("seed"),
              generator: "upscale",
              sourceId: "fixture-draft",
              upscaleFactor: 1.5,
            },
          },
        ],
      }),
    );
    const waiting = /Stage 1 of 1 · Upscale 1\.5× · waiting for approval/;
    await review(page).getByText(waiting).waitFor();
    await page.waitForTimeout(1200);
    const baseline = await measure(page);
    await page
      .getByRole("button", { name: library[2].label, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Upscale models", exact: true })
      .first()
      .click();
    await page
      .getByRole("option", { name: /Upscale/ })
      .first()
      .click();
    await page.waitForTimeout(400);
    await page
      .locator('article[aria-label^="Chain:"]')
      .getByRole("button", { name: /^Review/ })
      .click();
    await review(page).getByText(waiting).waitFor();
    assert.equal(
      await page.locator("#main-video video").first().getAttribute("src"),
      library[0].url,
      "the reloaded review shows the draft it continues",
    );
    await review(page)
      .getByRole("button", { name: /^Approve \$/ })
      .click();
    await review(page)
      .getByText("All 1 stage ready")
      .waitFor({ timeout: 15_000 });
    assert.equal(api.state.approvals, 1);
    assert.match(
      await page.locator(".composer .mode-badge").innerText(),
      /Text to video/,
    );
    await steady(page, baseline, "1440px reloaded chain");
    checks.push(
      "1440px: after a reload a paused Studio upscale reopens over its draft and is approved once",
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify({ base, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, output }, null, 2));
} finally {
  await browser.close();
}
