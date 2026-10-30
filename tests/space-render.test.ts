import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SPACE_PRESETS, SPACE_ROOMS } from "../shared/space";
import { wav } from "./audio-fixtures";
import { cleanups, hasFfmpeg, setup } from "./ffmpeg-harness";

// The space tool through real ffmpeg, skipped where it is not installed:
// each room's measured decay, and a video whose picture is copied untouched.
const RATE = 48_000;

/** RT60 from the Schroeder backward integral, fitted from −5 to −25 dB (T20). */
function rt60(samples: Float64Array) {
  const energy = new Float64Array(samples.length);
  let sum = 0;
  for (let i = samples.length - 1; i >= 0; i--)
    energy[i] = sum += samples[i] ** 2;
  let n = 0,
    sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  energy.forEach((value, i) => {
    const db = 10 * Math.log10(value / energy[0]);
    if (db > -5 || db < -25) return;
    const x = i / RATE;
    n++;
    sx += x;
    sy += db;
    sxx += x * x;
    sxy += x * db;
  });
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return -60 / slope;
}

/** The first channel of a 16-bit PCM WAV, as floats. */
function firstChannel(bytes: Buffer) {
  const channels = bytes.readUInt16LE(22);
  const data = bytes.indexOf("data") + 8;
  const frames = Math.floor((bytes.length - data) / (2 * channels));
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i++)
    out[i] = bytes.readInt16LE(data + i * 2 * channels) / 32768;
  return out;
}

const md5 = (file: string, stream: string) =>
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    file,
    "-map",
    stream,
    "-c",
    "copy",
    "-f",
    "md5",
    "-",
  ]).toString();

describe("space with real ffmpeg", () => {
  it.skipIf(!hasFfmpeg)(
    "gives each room the decay its preset names, within 10%",
    async () => {
      const { upload, media, store } = await setup();
      // One impulse per room, each in its own segment, far enough apart that
      // every tail has died before the next impulse.
      const segments: { start: number; end: number; preset: string }[] = [];
      let start = 0;
      for (const preset of SPACE_PRESETS) {
        segments.push({ start, end: start + 0.5, preset });
        start += 0.5 + 1.2 * SPACE_ROOMS[preset].rt60Seconds + 0.3;
      }
      const length = Math.ceil(start + 1);
      const input = wav(length, RATE);
      const view = new DataView(input.buffer);
      for (const segment of segments)
        view.setInt16(
          44 + Math.round((segment.start + 0.1) * RATE) * 2,
          29000,
          true,
        );
      const track = await upload(input, "audio/wav", "impulses.wav");
      const made = await media("space", {
        sourceId: track.id,
        segments: segments.map((s) => ({ ...s, level: "high" })),
      });
      expect(made.status).toBe(201);
      const { source } = await made.json();
      expect(source).toMatchObject({
        mediaType: "audio",
        label: "Space of impulses.wav",
      });
      expect(source.duration).toBeCloseTo(length, 2);
      const file = store.data.sources.find((s) => s.id === source.id)!.filePath;
      const out = firstChannel(await readFile(file));
      const measured: Record<string, number> = {};
      for (const segment of segments) {
        const { rt60Seconds } = SPACE_ROOMS[segment.preset as "cathedral"];
        // From just after the dry impulse to the end of the room's tail.
        const from = Math.round((segment.start + 0.1) * RATE) + 1;
        const tail = out.subarray(
          from,
          from + Math.round(1.2 * rt60Seconds * RATE),
        );
        measured[segment.preset] = rt60(tail);
        expect(
          Math.abs(measured[segment.preset] / rt60Seconds - 1),
          `${segment.preset}: ${measured[segment.preset].toFixed(3)} s`,
        ).toBeLessThan(0.1);
      }
      // The source is untouched.
      expect(
        (
          await readFile(
            store.data.sources.find((s) => s.id === track.id)!.filePath,
          )
        ).equals(Buffer.from(input)),
      ).toBe(true);
    },
    60_000,
  );

  it.skipIf(!hasFfmpeg)(
    "copies a video's picture stream byte for byte and replaces only its sound",
    async () => {
      const { upload, media, store } = await setup();
      const work = await mkdtemp(path.join(os.tmpdir(), "genobi-space-"));
      cleanups.push(() => rm(work, { recursive: true, force: true }));
      const file = path.join(work, "clip.mp4");
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x240:rate=24:duration=3",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000:duration=3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-f",
        "mp4",
        file,
      ]);
      const video = await upload(
        new Uint8Array(await readFile(file)),
        "video/mp4",
        "clip.mp4",
      );
      const made = await media("space", {
        sourceId: video.id,
        segments: [{ start: 1, end: 2, preset: "empty_club", level: "high" }],
      });
      expect(made.status).toBe(201);
      const { source } = await made.json();
      expect(source).toMatchObject({ width: 320, height: 240 });
      const stored = store.data.sources.find((s) => s.id === source.id)!;
      const original = store.data.sources.find((s) => s.id === video.id)!;
      expect(md5(stored.filePath, "0:v:0")).toBe(
        md5(original.filePath, "0:v:0"),
      );
      expect(md5(stored.filePath, "0:a:0")).not.toBe(
        md5(original.filePath, "0:a:0"),
      );
      const streams = execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name",
        "-of",
        "csv=p=0",
        stored.filePath,
      ])
        .toString()
        .trim()
        .split("\n");
      expect(streams.sort()).toEqual(["aac,audio", "h264,video"]);
    },
    60_000,
  );
});
