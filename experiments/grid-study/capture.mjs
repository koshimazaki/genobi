/* global window, process, URL, console, Buffer */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright";
const base = process.env.STUDY_URL ?? "http://127.0.0.1:4324";
const out =
  process.env.STUDY_OUT ?? new URL("./previews/", import.meta.url).pathname;
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  channel: process.env.CHROME_BIN ? undefined : "chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const reports = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(base).origin
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/experiments/grid-study/");
  await page.waitForFunction(() => window.gridStudy?.get().ready);
  for (const mode of ["poster", "water"]) {
    await page.evaluate(
      (mode) =>
        window.gridStudy.set({ mode, intensity: 0.64, grid: true, frame: 0 }),
      mode,
    );
    const encoder = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      "24",
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "27",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      `${out}/${mode}.mp4`,
    ]);
    let stderr = "";
    encoder.stderr.on("data", (chunk) => (stderr += chunk));
    const finished = once(encoder, "close");
    for (let frame = 0; frame < 96; frame++) {
      const png = await page.evaluate(async (frame) => {
        await window.render(frame);
        return window.gridStudy.canvas.toDataURL("image/png").split(",")[1];
      }, frame);
      if (!encoder.stdin.write(Buffer.from(png, "base64")))
        await once(encoder.stdin, "drain");
    }
    encoder.stdin.end();
    const [code] = await finished;
    assert.equal(code, 0, stderr);
    await page.evaluate(() => window.render(40));
    const png = await page.evaluate(
      () => window.gridStudy.canvas.toDataURL("image/png").split(",")[1],
    );
    await writeFile(`${out}/${mode}.png`, png, "base64");
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "stream=codec_type,width,height,r_frame_rate,nb_frames",
          "-show_entries",
          "format=duration,size",
          "-of",
          "json",
          `${out}/${mode}.mp4`,
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(probe.streams.length, 1);
    assert.equal(probe.streams[0].nb_frames, "96");
    assert.equal(probe.streams[0].r_frame_rate, "24/1");
    assert.equal(Number(probe.format.duration), 4);
    reports.push({
      mode,
      file: `${mode}.mp4`,
      ...probe,
      source: (await page.evaluate(() => window.gridStudy.get())).source,
    });
    console.log(`Captured ${mode}:96 frames /4s`);
  }
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    `${out}/poster.mp4`,
    "-i",
    `${out}/water.mp4`,
    "-filter_complex",
    "[0:v]scale=480:270[a];[1:v]scale=480:270[b];[a][b]hstack=inputs=2",
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "27",
    "-preset",
    "medium",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    "-y",
    `${out}/two-grids.mp4`,
  ]);
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/capture-report.json`,
    JSON.stringify(
      {
        timing: "Authored frame clock; silent, no music analysis.",
        reports,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
