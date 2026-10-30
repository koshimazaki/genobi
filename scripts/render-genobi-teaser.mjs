// Renders the Genobi teaser with the Director's own Render MP4 (the button a
// person presses), in headless Chrome against your local server, and saves
// the video with a contact sheet (docs/genobi-teaser.md#re-render). Nothing
// is generated or paid for. Start your own server first (see
// scripts/capture-genobi-teaser.mjs), then:
//   TEASER_URL=http://127.0.0.1:4317 node scripts/render-genobi-teaser.mjs [out-dir]
// TEASER_EXAMPLE renders another mix template the same way (Bloom:
// TEASER_EXAMPLE=bloom-teaser; docs/bloom-teaser.md).
// Needs Chrome and FFmpeg. Output: render.mp4 and contact-sheet.png in
// out-dir (default .local/genobi-teaser/render).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";

const base = process.env.TEASER_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Render from a local server",
);
const example = process.env.TEASER_EXAMPLE ?? "genobi-teaser";
assert(
  /^[a-z][a-z0-9-]{0,63}$/.test(example),
  "TEASER_EXAMPLE is a template id",
);
const out = process.argv[2] ?? `.local/${example}/render`;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.TEASER_BROWSER ?? "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem("genobi.startup-guide.v1", "seen"),
  );
  // TEASER_MBPS asks the export for a master's bitrate (src/director/export.ts).
  const mbps = process.env.TEASER_MBPS
    ? `&exportMbps=${Number(process.env.TEASER_MBPS)}`
    : "";
  await page.goto(
    `${base}/director?example=${example}&workspace=editor${mbps}`,
  );
  await page
    .getByText("Ready · local preview", { exact: true })
    .waitFor({ timeout: 180000 });
  // The run kit renders an independent bundle; the bundled cut stays intact.
  if (process.env.TEASER_BUNDLE) {
    await page
      // The Director's own import is a direct child of main.director
      // (src/director/Director.tsx); Scrolls mounts another .zip,.json input.
      .locator('main.director > input[type="file"][accept=".zip,.json"]')
      .setInputFiles(process.env.TEASER_BUNDLE);
    await page
      .getByText("Project · Teaser run", { exact: true })
      .waitFor({ timeout: 180000 });
    await page.getByRole("button", { name: "Render MP4" }).waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent?.startsWith("Render MP4") && !b.disabled,
      ),
    );
    await page
      .getByText("Ready · local preview", { exact: true })
      .waitFor({ timeout: 180000 });
  }
  const started = Date.now();
  await page.getByRole("button", { name: "Render MP4" }).click();
  await page.getByText(/^Render ready · MP4/).waitFor({ timeout: 90 * 60000 });
  console.log(`rendered in ${Math.round((Date.now() - started) / 1000)} s`);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /^Download video/ }).click();
  await (await download).saveAs(`${out}/render.mp4`);
  const frames = execFileSync("ffprobe", [
    ...["-v", "error", "-count_frames", "-select_streams", "v:0"],
    ...["-show_entries", "stream=nb_read_frames", "-of", "csv=p=0"],
    `${out}/render.mp4`,
  ])
    .toString()
    .trim();
  console.log(`${out}/render.mp4: ${frames} frames`);
  // Twelve frames across the cut.
  const seconds = Number(
    execFileSync("ffprobe", [
      ...["-v", "error", "-show_entries", "format=duration"],
      ...["-of", "csv=p=0", `${out}/render.mp4`],
    ]),
  );
  execFileSync("ffmpeg", [
    ...["-v", "error", "-y", "-i", `${out}/render.mp4`],
    ...["-vf", `fps=12/${seconds},scale=480:-1,tile=4x3`, "-frames:v", "1"],
    `${out}/contact-sheet.png`,
  ]);
  if (errors.length) console.warn(`page errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
