// Synthetic signals with known answers for the audio analysis tests, and a
// 16-bit WAV encoder and decoder so a fake ffmpeg can hand them back as PCM.
import { readFile, writeFile } from "node:fs/promises";
import type { Run } from "../server/ffmpeg";

export const RATE = 22_050;

/** A seeded generator, so noise is the same on every run. */
export function random(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

/** Adds `sound(seconds since the hit)` at each time, for `length` seconds. */
function hits(
  x: Float32Array,
  times: number[],
  length: number,
  sound: (s: number) => number,
) {
  for (const t of times) {
    const at = Math.round(t * RATE);
    for (let i = 0; i < length * RATE && at + i < x.length; i++)
      x[at + i] += sound(i / RATE);
  }
  return x;
}

export const click = (s: number) => (s < 0.001 ? 0.9 * (1 - s / 0.001) : 0);
/** A pitched-down sine with a fast decay, under 150 Hz. */
export const kick = (s: number) =>
  0.9 *
  Math.sin(2 * Math.PI * (55 * s + (1 - Math.exp(-s * 30)) * 1.5)) *
  Math.exp(-s * 15);

export function beatTimes(bpm: number, offset: number, seconds: number) {
  const out: number[] = [];
  for (let t = offset; t < seconds - 0.3; t += 60 / bpm) out.push(t);
  return out;
}

export function clickTrack(bpm: number, offset: number, seconds: number) {
  return hits(
    new Float32Array(seconds * RATE),
    beatTimes(bpm, offset, seconds),
    0.01,
    click,
  );
}

export function kicksAt(times: number[], seconds: number) {
  return hits(new Float32Array(seconds * RATE), times, 0.5, kick);
}

/** A noise burst for the snare band, from a seeded generator. */
export function snaresAt(times: number[], seconds: number) {
  const next = random(7);
  return hits(
    new Float32Array(seconds * RATE),
    times,
    0.25,
    (s) => 0.5 * (next() * 2 - 1) * Math.exp(-s * 25),
  );
}

/** Noise rising 28 dB over eight seconds, 0.3 s of silence, then a loud drop. */
export function buildUpAndDrop() {
  const next = random(3);
  const x = new Float32Array(20 * RATE);
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    const amp =
      t < 2
        ? 0.01
        : t < 10
          ? 0.01 * 10 ** (((t - 2) / 8) * 1.4)
          : t < 10.3
            ? 0
            : 0.6;
    x[i] = amp * (next() * 2 - 1);
    if (t >= 10.3)
      x[i] +=
        0.4 *
        Math.sin(2 * Math.PI * 55 * t) *
        Math.exp(-((t - 10.3) % 0.5) * 8);
  }
  return x;
}

/** Noise rising steadily for sixteen seconds, with no drop. */
export function swell() {
  const next = random(5);
  const x = new Float32Array(20 * RATE);
  for (let i = 0; i < x.length; i++)
    x[i] =
      0.01 * 10 ** ((Math.min(i / RATE, 16) / 16) * 1.4) * (next() * 2 - 1);
  return x;
}

export function wav16(samples: Float32Array, rate = RATE) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) =>
    view.setInt16(
      44 + i * 2,
      Math.round(Math.max(-1, Math.min(1, v)) * 32767),
      true,
    ),
  );
  return bytes;
}

/** A 32-bit IEEE-float mono WAV (format 3), which may hold NaN or infinity. */
export function floatWav(samples: Float32Array, rate = RATE) {
  const bytes = new Uint8Array(44 + samples.length * 4);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 4, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  text(36, "data");
  view.setUint32(40, samples.length * 4, true);
  samples.forEach((v, i) => view.setFloat32(44 + i * 4, v, true));
  return bytes;
}

/**
 * Stands in for ffmpeg: `-version` answers, and a PCM decode of one of the
 * mono WAVs (16-bit, or 32-bit float as `floatWav` writes) is written as
 * float32 at 22.05 kHz, as ffmpeg would, NaN and infinity included. Counts its decodes.
 */
export function fakeFfmpeg() {
  const calls = { decodes: 0 };
  const run: Run = async (_command, args) => {
    if (args[0] === "-version") return "ffmpeg version test";
    if (!args.includes("f32le")) throw new Error("unexpected ffmpeg call");
    calls.decodes++;
    const input = await readFile(args[args.indexOf("-i") + 1]);
    const view = new DataView(input.buffer, input.byteOffset);
    // Nearest-sample resampling from the header's rate is enough here.
    const ratio = view.getUint32(24, true) / RATE;
    const float = view.getUint16(20, true) === 3;
    const width = float ? 4 : 2;
    const read = (n: number) =>
      float
        ? view.getFloat32(44 + n * 4, true)
        : view.getInt16(44 + n * 2, true) / 32767;
    const samples = new Float32Array(
      Math.floor((input.length - 44) / width / ratio),
    );
    for (let i = 0; i < samples.length; i++)
      samples[i] = read(Math.floor(i * ratio));
    await writeFile(args.at(-1)!, new Uint8Array(samples.buffer));
    return "";
  };
  return { run, calls };
}
