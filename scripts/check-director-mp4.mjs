// Run after check-director-browser.mjs. Requires independently installed FFmpeg.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const dir = ".local/director";
const file = `${dir}/render.mp4`;
const { composition: c } = JSON.parse(
  await readFile("docs/director-bundle/example/studio.json", "utf8"),
);
const probe = (args) =>
  JSON.parse(
    execFileSync("ffprobe", ["-v", "error", ...args, "-of", "json", file]),
  );
const metadata = probe(["-count_frames", "-show_streams", "-show_format"]);
const video = metadata.streams.find((s) => s.codec_type === "video");
const audio = metadata.streams.find((s) => s.codec_type === "audio");
assert.equal(video.codec_name, "h264");
assert.equal(audio.codec_name, "aac");
assert.equal(Number(audio.sample_rate), 48000);
assert.equal(Number(video.nb_read_frames), c.durationFrames);
assert.equal(video.avg_frame_rate, `${c.fps}/1`);
for (const s of [video, audio, metadata.format])
  assert.ok(Math.abs(Number(s.duration) - c.durationFrames / c.fps) <= 0.001);
const frames = probe([
  "-select_streams",
  "v:0",
  "-show_frames",
  "-show_entries",
  "frame=best_effort_timestamp_time,pkt_duration_time",
]).frames;
assert.equal(frames.length, c.durationFrames);
frames.forEach((f, index) =>
  assert.ok(
    Math.abs(Number(f.best_effort_timestamp_time) - index / c.fps) < 0.000002,
    `Frame ${index} timestamp`,
  ),
);
console.log(
  `PASS ${frames.length} frames, fixed ${c.fps} fps timestamps; audio/video/container duration=${metadata.format.duration}s`,
);
const decode = (input, options) =>
  execFileSync("ffmpeg", ["-v", "error", "-i", input, ...options, "pipe:1"], {
    maxBuffer: 32 * 1024 * 1024,
  });
for (const frame of [0, 75, 140, 179]) {
  const exported = decode(file, [
    "-vf",
    `select=eq(n\\,${frame})`,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
  ]);
  const preview = decode(`${dir}/frame-${frame}.png`, [
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
  ]);
  assert.equal(exported.length, preview.length);
  let squared = 0;
  for (let i = 0; i < preview.length; i++)
    if (i % 4 !== 3) squared += (preview[i] - exported[i]) ** 2;
  const rmse = Math.sqrt(squared / ((preview.length * 3) / 4));
  const psnr = 20 * Math.log10(255 / rmse);
  assert.ok(psnr > 32, `Frame ${frame}: preview/export PSNR ${psnr}`);
  console.log(
    `PASS frame ${frame}: preview/export PSNR=${psnr.toFixed(2)} dB (images, graphics and CRT composed)`,
  );
}
const float = (bytes) =>
  new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
const source = float(
  decode("docs/director-bundle/example/media/pulse.wav", [
    "-ac",
    "1",
    "-f",
    "f32le",
  ]),
);
const encoded = float(decode(file, ["-vn", "-ac", "1", "-f", "f32le"]));
let best = -Infinity,
  lag = 0;
for (let offset = -256; offset <= 256; offset++) {
  let dot = 0;
  for (let i = 512; i < 24000; i += 8) dot += source[i] * encoded[i + offset];
  if (dot > best) {
    best = dot;
    lag = offset;
  }
}
assert.ok(Math.abs(lag) <= 4, `Audio alignment: ${lag} samples`);
console.log(
  `PASS decoded AAC/source alignment=${lag} samples (${(lag / 48).toFixed(3)} ms)`,
);

const shortFile = `${dir}/nonstandard.mp4`;
const short = JSON.parse(
  execFileSync("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    shortFile,
  ]),
);
assert.equal(Number(short.streams[0].nb_read_frames), 37);
assert.equal(short.streams[0].avg_frame_rate, "24/1");
for (const s of [...short.streams, short.format])
  assert.ok(Math.abs(Number(s.duration) - 37 / 24) <= 0.001);
const mixed = float(decode(shortFile, ["-vn", "-ac", "1", "-f", "f32le"]));
const expected = new Float32Array(74000);
for (const l of [
  { start: 5, length: 20, source: 12, gain: 0.5 },
  { start: 12, length: 25, source: 0, gain: 0.3 },
])
  for (let i = 0; i < l.length * 2000; i++)
    expected[l.start * 2000 + i] += source[l.source * 2000 + i] * l.gain;
// AAC is lossy; normalized correlation tests the timing and actual mix envelope.
let dot = 0,
  actualEnergy = 0,
  expectedEnergy = 0;
for (let i = 0; i < expected.length; i++) {
  dot += mixed[i] * expected[i];
  actualEnergy += mixed[i] ** 2;
  expectedEnergy += expected[i] ** 2;
}
const correlation = dot / Math.sqrt(actualEnergy * expectedEnergy);
assert.ok(
  correlation > 0.99,
  `Offset/trim/overlap audio correlation=${correlation}`,
);
console.log(
  `PASS 37 frames at 24 fps; trimmed/offset/overlap audio correlation=${correlation.toFixed(5)}`,
);
