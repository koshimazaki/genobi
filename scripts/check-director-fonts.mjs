// Start the local server first (`npm run dev`). Checks that the Editor's
// preview and Render MP4 draw the Dimensions mix title in the same face,
// that a font the page cannot use is named in the inspector, and that a new
// font shows in the preview once it has loaded. DIRECTOR_BROWSER_PATH runs it
// in another Chromium build (Brave hides user-installed fonts, for one).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
const FRAME = 350; // the title slam has landed (bar 9)
const SAME = 6; // mean RGB difference under H.264 for the same frame
const out = ".local/director/fonts";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.DIRECTOR_BROWSER_PATH
    ? { executablePath: process.env.DIRECTOR_BROWSER_PATH }
    : { channel: process.env.DIRECTOR_BROWSER ?? "chrome" }),
});
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });
  await context.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/director?example=dimensions-mix&workspace=editor`);
  const ready = () =>
    page
      .getByText("Ready · local preview", { exact: true })
      .waitFor({ timeout: 90_000 });
  await ready();
  const canvas = page.locator("canvas[data-frame]");
  const titleFont = async () =>
    (await canvas.getAttribute("data-fonts"))
      .split("|")
      .find((s) => s.startsWith("title:"))
      ?.slice("title:".length);

  /** The preview's pixels at FRAME, kept in the page under `name`. */
  async function preview(name) {
    await page.getByRole("slider", { name: "Playhead" }).fill("0");
    await page.getByRole("slider", { name: "Playhead" }).fill(String(FRAME));
    await page.waitForFunction(
      (f) =>
        document.querySelector("canvas[data-frame]")?.dataset.frame ===
        String(f),
      FRAME,
    );
    const png = await page.evaluate((name) => {
      const c = document.querySelector("canvas[data-frame]");
      const ctx = c.getContext("2d");
      (window.__frames ??= {})[`${name}-preview`] = ctx.getImageData(
        0,
        0,
        c.width,
        c.height,
      );
      return c.toDataURL("image/png");
    }, name);
    await writeFile(`${out}/${name}-preview.png`, png.split(",")[1], "base64");
  }
  /** Render MP4 and keep FRAME of the file, decoded, under `name`. */
  async function exported(name) {
    await page
      .getByRole("button", { name: /Render MP4/ })
      .first()
      .click();
    await page
      .getByText("Render ready · MP4 with audio", { exact: true })
      .waitFor({ timeout: 600_000 });
    const href = await page
      .locator('a[download="director-render.mp4"]')
      .getAttribute("href");
    const png = await page.evaluate(
      async ({ href, name, frame }) => {
        const v = document.createElement("video");
        v.muted = true;
        v.src = href;
        await new Promise((r) => (v.onloadeddata = r));
        const fps = 24;
        v.currentTime = (frame + 0.5) / fps;
        await new Promise((r) => (v.onseeked = r));
        const c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext("2d");
        ctx.drawImage(v, 0, 0);
        window.__frames[`${name}-export`] = ctx.getImageData(
          0,
          0,
          c.width,
          c.height,
        );
        return c.toDataURL("image/png");
      },
      { href, name, frame: FRAME },
    );
    await writeFile(`${out}/${name}-export.png`, png.split(",")[1], "base64");
  }
  /** Mean RGB difference over the title's band of the frame. */
  const diff = (a, b) =>
    page.evaluate(
      ([a, b]) => {
        const x = window.__frames[a],
          y = window.__frames[b];
        const top = Math.floor(x.height * 0.25),
          bottom = Math.floor(x.height * 0.75);
        let sum = 0,
          n = 0;
        for (let row = top; row < bottom; row++)
          for (let col = 0; col < x.width; col++) {
            const i = (row * x.width + col) * 4;
            for (let k = 0; k < 3; k++)
              sum += Math.abs(x.data[i + k] - y.data[i + k]);
            n += 3;
          }
        return sum / n;
      },
      [a, b],
    );

  // 1. The template as it opens: the preview frame and the MP4 frame agree.
  const first = await titleFont();
  assert.ok(first, "the renderer reports the title's resolved face");
  await preview("template");
  await exported("template");
  const templateDiff = await diff("template-preview", "template-export");
  console.log(
    `template title in ${first}: preview vs MP4 ${templateDiff.toFixed(2)}`,
  );
  assert.ok(templateDiff < SAME, `preview and MP4 differ: ${templateDiff}`);

  // 2. A font this page cannot use is named, and both paths show the fallback.
  await page
    .getByRole("button", {
      name: "Select Title · Supernatural creatures",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Show inspector" }).click();
  /** Set the title's font and wait for a renderer that resolved `face`. */
  const setFont = async (stack, face) => {
    const input = page.getByLabel("font", { exact: true });
    await input.fill(stack);
    await input.blur();
    await page.waitForFunction(
      (face) =>
        (
          document.querySelector("canvas[data-frame]")?.dataset.fonts ?? ""
        ).includes(`title:${face}`),
      face,
      { timeout: 90_000 },
    );
    await ready();
  };
  await setFont(
    '"Genobi Missing Font", "Instrument Sans Variable", sans-serif',
    "Instrument Sans Variable",
  );
  await page
    .getByText(
      "Font 'Genobi Missing Font' isn't available here; showing Instrument Sans Variable.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await titleFont(), "Instrument Sans Variable");
  await preview("missing");
  await exported("missing");
  const missingDiff = await diff("missing-preview", "missing-export");
  console.log(`missing font: preview vs MP4 ${missingDiff.toFixed(2)}`);
  assert.ok(missingDiff < SAME, `preview and MP4 differ: ${missingDiff}`);

  // 3. Changing the font redraws the preview in the new face once loaded.
  await setFont('"pixelify sans", monospace', "Pixelify Sans");
  await page
    .getByText("Showing Pixelify Sans (bundled).", { exact: true })
    .waitFor();
  assert.equal(await titleFont(), "Pixelify Sans");
  await preview("changed");
  const changed = await diff("changed-preview", "missing-preview");
  console.log(`after the change: new preview vs old ${changed.toFixed(2)}`);
  assert.ok(changed > SAME, "the preview did not change with the font");
  assert.deepEqual(errors, []);
  console.log(
    `PASS preview and Render MP4 agree on the title font; frames in ${out}`,
  );
} finally {
  await browser.close();
}
