/** Deterministic local study captures; ffmpeg encodes every rendered PNG frame. */
/* global window, process, URL, console, Buffer */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright";
const out = process.env.STUDY_OUT ?? "/tmp/genobi-effects-evidence";
const base = process.env.STUDY_URL ?? "http://127.0.0.1:4321";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  channel: process.env.CHROME_BIN ? undefined : "chrome",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const report = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(base).origin
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/experiments/effects-study/`);
  await page.waitForFunction(() => window.effectsStudy?.get().ready, null, {
    timeout: 60000,
  });
  for (const mode of ["helmet", "mirror", "terrain"]) {
    await page.evaluate(
      (mode) => window.effectsStudy.set({ mode, intensity: 0.65, frame: 0 }),
      mode,
    );
    const target = `${out}/${mode}.mp4`;
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
      target,
    ]);
    let diagnostics = "";
    encoder.stderr.on("data", (data) => {
      diagnostics += data;
    });
    const finished = once(encoder, "close");
    for (let frame = 0; frame < 96; frame++) {
      const png = await page.evaluate(async (frame) => {
        await window.render(frame);
        return window.effectsStudy.canvas.toDataURL("image/png").split(",")[1];
      }, frame);
      if (!encoder.stdin.write(Buffer.from(png, "base64")))
        await once(encoder.stdin, "drain");
    }
    encoder.stdin.end();
    const [code] = await finished;
    assert.equal(code, 0, diagnostics);
    await page.evaluate(() => window.render(72));
    const png = await page.evaluate(
      () => window.effectsStudy.canvas.toDataURL("image/png").split(",")[1],
    );
    await writeFile(`${out}/${mode}-poster.png`, png, "base64");
    report.push({
      mode,
      file: target,
      frames: 96,
      fps: 24,
      seconds: 4,
      width: 960,
      height: 540,
      source: await page.evaluate(() => window.effectsStudy.get().source),
    });
    console.log(`PASS captured ${mode}: 96 frames / 4 seconds`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(`${out}/captures.json`, JSON.stringify(report, null, 2));
}
