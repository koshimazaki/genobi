// The showcase projects (docs/director-bundle/showcase/) open in the Editor
// from the gallery: every recorded version of every record opens from its
// card's "How it was made" list as an editable project of its own, and its
// Program draws. Frames are saved for a look. Start the local server first
// (DIRECTOR_URL, default http://127.0.0.1:4317); Chrome by default,
// DIRECTOR_BROWSER for another. Output: SHOWCASE_OUT or .local/showcase.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local server",
);
const out = process.env.SHOWCASE_OUT ?? ".local/showcase";
await mkdir(out, { recursive: true });
const root = "docs/director-bundle/showcase";
const records = [];
for (const name of await readdir(root, { withFileTypes: true }))
  if (name.isDirectory())
    records.push(
      JSON.parse(await readFile(`${root}/${name.name}/memory.json`, "utf8")),
    );
const template = {
  "dimensions-mix": "Dimensions mix",
  "genobi-teaser": "Genobi teaser",
  "bloom-teaser": "Bloom",
  "adaptive-reverb": "Adaptive reverb",
};
// A frame worth looking at in each: the end card, the teaser's first drop
// Bloom's title and Adaptive reverb's cathedral scan.
const FRAME = {
  "dimensions-mix": 554,
  "genobi-teaser": 420,
  "bloom-teaser": 300,
  "adaptive-reverb": 300,
};

const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
try {
  for (const record of records)
    for (const v of record.versions) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1050 },
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() =>
        localStorage.setItem("genobi.startup-guide.v1", "seen"),
      );
      const preview = page.locator('canvas[aria-label="Director preview"]');
      const drew = () =>
        page.waitForFunction(
          () =>
            document.querySelector('canvas[aria-label="Director preview"]')
              ?.dataset.frame !== undefined,
          null,
          { timeout: 120000 },
        );
      await page.goto(`${base}/`);
      await drew();
      await page
        .getByLabel(`View ${template[record.template] ?? record.name}`)
        .first()
        .click();
      const list = page.getByRole("region", { name: "How it was made" });
      if (v.version === 1)
        await list.screenshot({ path: `${out}/${record.project}-gallery.png` });
      await list
        .getByRole("link", { name: `Open v${v.version} in the editor` })
        .click();
      await page
        .getByText("Ready · local preview", { exact: true })
        .waitFor({ timeout: 120000 });
      assert.equal(
        await page.evaluate(() =>
          new URL(location.href).searchParams.get("showcase"),
        ),
        record.project,
      );
      const f = Math.min(FRAME[record.project] ?? 30, v.durationFrames - 1);
      for (let attempt = 0; ; attempt++) {
        await page
          .getByRole("slider", { name: "Playhead", exact: true })
          .fill(String(f));
        try {
          await page.waitForFunction(
            (f) =>
              document.querySelector('canvas[aria-label="Director preview"]')
                .dataset.frame === String(f),
            f,
            { timeout: 20000 },
          );
          break;
        } catch (error) {
          if (attempt >= 3) throw error;
        }
      }
      await page.waitForTimeout(500);
      const png = await preview.evaluate(
        (c) => c.toDataURL("image/png").split(",")[1],
      );
      await writeFile(
        `${out}/${record.project}-v${v.version}-${f}.png`,
        Buffer.from(png, "base64"),
      );
      await page.screenshot({
        path: `${out}/${record.project}-v${v.version}-editor.png`,
      });
      const title = await page
        .locator(".dir-stage-footer")
        .first()
        .textContent();
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${record.project} v${v.version} opens in the Editor (${title?.trim()})`,
      );
      await page.close();
    }
  console.log(`Frames in ${out}`);
} finally {
  await browser.close();
}
