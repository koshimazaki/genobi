/** Build actual editable RGB/depth/audio pilot inputs without a model or provider. */
import { createServer } from "vite";
import { chromium } from "playwright";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { reserveCaptureDirectory } from "./capture-files.mjs";

const { values } = parseArgs({
  options: {
    output: { type: "string", default: ".local/ltx-pilot" },
    track: {
      type: "string",
      default: "public/media/director-templates/dimensions-mix/mix-track.mp3",
    },
    start: { type: "string", default: "16" },
    frames: { type: "string", default: "193" },
    width: { type: "string", default: "768" },
    height: { type: "string", default: "448" },
    studies: { type: "string", default: "fruit,architecture,falling,room" },
    cues: { type: "string" },
    browser: { type: "string" },
    port: { type: "string", default: "4518" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "node scripts/experiments/capture.mjs --output .local/ltx-pilot [--track PATH --start 16 --studies fruit,architecture,falling,room --browser CHROME --cues cues.json]\nNo model submission. Defaults: 193 frames at 24 fps, 768×448 RGB/depth guides (1536×896 candidate output after 2× upscale), exact soundtrack excerpt, editable recipes, cue and sound receipts. Cues are band-change candidates unless supplied explicitly.",
  );
  process.exit(0);
}
const dimensions = {
  width: Number(values.width),
  height: Number(values.height),
  frames: Number(values.frames),
};
const start = Number(values.start),
  port = Number(values.port);
const studies = values.studies.split(",");
if (
  ![97, 193].includes(dimensions.frames) ||
  [dimensions.width, dimensions.height].some(
    (n) => !Number.isInteger(n) || n < 256 || n > 1920 || n % 64,
  ) ||
  !Number.isFinite(start) ||
  start < 0 ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  studies.some((s) => !["fruit", "architecture", "falling", "room"].includes(s))
)
  throw new Error(
    "Use 97/193 frames, 256–1920 dimensions divisible by 64, a non-negative audio offset and known study IDs.",
  );
if (
  dimensions.width * dimensions.height * dimensions.frames * 12 >
  2 * 1024 ** 3
)
  throw new Error(
    "Guide exceeds the native capture decoder's 2 GiB bound; reduce dimensions.",
  );
const output = resolve(values.output),
  track = resolve(values.track);
await stat(track);
await reserveCaptureDirectory(output);
const cues = values.cues
  ? JSON.parse(await readFile(values.cues, "utf8"))
  : undefined;
const seconds = dimensions.frames / 24;
const pcm = join(output, "source-excerpt.wav");
const inspect = (file, video = false) =>
  JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        ...(video ? ["-select_streams", "v:0", "-count_frames"] : []),
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    ),
  );
const sourceProbe = inspect(track);
if (Number(sourceProbe.format.duration) < start + seconds)
  throw new Error(
    "The track does not contain the complete requested excerpt; no automatic silence padding.",
  );
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-nostdin",
  "-y",
  "-i",
  track,
  "-ss",
  String(start),
  "-t",
  String(seconds),
  "-ar",
  "48000",
  "-ac",
  "2",
  "-c:a",
  "pcm_s16le",
  pcm,
]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = {
  sourceFile: track.split("/").at(-1),
  sourceSha256: hash(await readFile(track)),
  excerptStartSeconds: start,
  excerptDurationSeconds: seconds,
  excerptSha256: hash(await readFile(pcm)),
  sourceProbe,
};
await writeFile(join(output, "source.json"), JSON.stringify(source, null, 2));
const origin = `http://127.0.0.1:${port}`;
const server = await createServer({
  cacheDir: join(output, "vite-cache"),
  server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: values.browser ?? process.env.CHROME_BIN,
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().startsWith("PILOT")) console.log(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || route.request().method() !== "GET")
      return route.abort();
    if (url.pathname === "/__pilot")
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      });
    if (url.pathname === "/__pilot_track")
      return route.fulfill({
        contentType: "audio/wav",
        body: await readFile(pcm),
      });
    return route.continue();
  });
  await page.exposeFunction("savePilotFile", async (name, bytes) => {
    if (
      !/^(fruit|architecture|falling|room)\/[a-z0-9-]+\.(json|png|wav|webm)$/.test(
        name,
      )
    )
      throw new Error("Invalid pilot output name.");
    const directory = join(output, name.split("/")[0]);
    await mkdir(directory, { recursive: true });
    await writeFile(join(output, name), Buffer.from(bytes));
  });
  await page.goto(`${origin}/__pilot`);
  const reports = [];
  for (const study of studies) {
    const report = await page.evaluate(
      async ({ study, dimensions, cues }) => {
        const { captureStudy } =
          await import("/scripts/experiments/capture-browser.ts");
        return captureStudy(study, dimensions, cues);
      },
      { study, dimensions, cues },
    );
    for (const pass of ["rgb.webm", "depth.webm"]) {
      const probe = inspect(join(output, study, pass), true),
        stream = probe.streams[0];
      if (
        Number(stream.nb_read_frames) !== dimensions.frames ||
        stream.r_frame_rate !== "24/1" ||
        stream.width !== dimensions.width ||
        stream.height !== dimensions.height ||
        Math.abs(Number(probe.format.duration) - seconds) > 0.002
      )
        throw new Error(`${study}/${pass} failed decoded timing verification.`);
      report[pass] = probe;
    }
    const dir = join(output, study);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-nostdin",
      "-y",
      "-i",
      join(dir, "rgb.webm"),
      "-i",
      join(dir, "control.wav"),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      String(seconds),
      "-movflags",
      "+faststart",
      join(dir, "preview.mp4"),
    ]);
    if (report.sound) {
      const wetStart =
        report.indoorFromFrame === null ? 0 : report.indoorFromFrame / 24;
      const total = report.sound.output.seconds;
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-i",
        join(dir, "rgb.webm"),
        "-i",
        join(dir, "control.wav"),
        "-i",
        join(dir, "room-wet.wav"),
        "-filter_complex",
        `[0:v]tpad=stop_mode=clone:stop_duration=${report.sound.tailSeconds}[v];[1:a]apad,volume=0.8[d];[2:a]volume=0.15,afade=t=in:st=${wetStart}:d=0.25[w];[d][w]amix=inputs=2:duration=longest:normalize=0[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        String(total),
        "-movflags",
        "+faststart",
        join(dir, "preview-room-sound.mp4"),
      ]);
      report.previewMix = {
        dry: 0.8,
        wet: 0.15,
        wetFadeInSeconds: 0.25,
        wetStartSeconds: wetStart,
        tail: "hold-final-picture",
        duration: total,
      };
    }
    await writeFile(join(dir, "study.json"), JSON.stringify(report, null, 2));
    reports.push(report);
    console.log(
      `PILOT ${study}: verified ${dimensions.frames} frames, RGB/depth/audio written`,
    );
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  await writeFile(
    join(output, "pilot.json"),
    JSON.stringify(
      { status: "guide-captured-no-model-run", source, reports, errors },
      null,
      2,
    ),
  );
  console.log(`Prepared ${reports.length} real guide captures in ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
