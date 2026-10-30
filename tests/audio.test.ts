import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectAudio } from "../shared/audio";
import { inspectUpload, uploadType, MISMATCH_MESSAGE } from "../shared/uploads";
import { isVideoSource } from "../shared/types";
import { flac, mp3, wav } from "./audio-fixtures";

const reader = (bytes: Uint8Array) => async (at: number, length: number) =>
  bytes.slice(at, at + length).buffer;
const inspect = (bytes: Uint8Array) =>
  inspectAudio(bytes.length, reader(bytes));

describe("audio uploads are measured from their headers", () => {
  it("reads WAV, FLAC and MP3 durations", async () => {
    expect(await inspect(wav(2))).toEqual({
      width: 0,
      height: 0,
      duration: 2,
      contentType: "audio/wav",
    });
    expect(await inspect(flac(88200))).toMatchObject({
      duration: 2,
      contentType: "audio/flac",
    });
    // A Xing frame states the frame count: 100 × 1152 / 44100 seconds.
    expect((await inspect(mp3(4096, 100))).duration).toBeCloseTo(2.6122, 3);
    // Without one, frames sampled across the file all at 128 kbps: 16,000 bytes.
    expect((await inspect(mp3(16000))).duration).toBeCloseTo(1, 3);
  });

  it("skips an ID3 tag larger than the first read, as album art makes one", async () => {
    const tagged = mp3(200_000, 100, 120_000);
    expect((await inspect(tagged)).duration).toBeCloseTo(2.6122, 3);
  });

  it("refuses what it cannot measure honestly", async () => {
    const ogg = new Uint8Array(64);
    ogg.set([0x4f, 0x67, 0x67, 0x53]);
    await expect(inspect(ogg)).rejects.toThrow(/WAV, FLAC or MP3/);
    await expect(inspect(flac(0))).rejects.toThrow();
    await expect(inspect(wav(21 * 60, 400))).rejects.toThrow(/twenty minutes/);
  });

  it("refuses a compressed WAV, whose byte rate does not measure its samples", async () => {
    await expect(inspect(wav(2, 8000, 0x11))).rejects.toThrow(
      /uncompressed WAV/,
    );
  });

  it("refuses an MP3 whose bitrate varies and states no frame count", async () => {
    // Alternating 128 and 192 kbps frames: no single bitrate turns size into time.
    await expect(inspect(mp3(400_000, undefined, 0, true))).rejects.toThrow(
      /constant bitrate/,
    );
    // The same frames with a Xing count are measured from the count.
    expect((await inspect(mp3(400_000, 100, 0, true))).duration).toBeCloseTo(
      2.6122,
      3,
    );
    // A first stretch of frames is not enough: the rest must be frames too.
    const padded = new Uint8Array(400_000);
    padded.set(mp3(70_000));
    await expect(inspect(padded)).rejects.toThrow(/constant bitrate/);
  });
});

const ffmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!ffmpeg)("audio encoded by FFmpeg", () => {
  // A tone under noise whose loudness swings, so LAME's VBR spends unevenly.
  const source = (seconds: number) => [
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `anoisesrc=duration=${seconds}:amplitude=0.3`,
    "-filter_complex",
    "[0][1]amix=inputs=2,volume='0.2+0.8*abs(sin(t))':eval=frame",
  ];
  const encode = async (seconds: number, name: string, codec: string[]) => {
    const dir = await mkdtemp(path.join(tmpdir(), "genobi-audio-"));
    try {
      const file = path.join(dir, name);
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        ...source(seconds),
        ...codec,
        file,
      ]);
      return new Uint8Array(await readFile(file));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };

  it("measures PCM, float and extensible WAV, and refuses IMA ADPCM", async () => {
    for (const codec of [
      ["-c:a", "pcm_s16le"],
      ["-c:a", "pcm_f32le"],
      ["-c:a", "pcm_s24le", "-ac", "6"],
    ])
      expect(
        (await inspect(await encode(10, "a.wav", codec))).duration,
      ).toBeCloseTo(10, 2);
    const adpcm = await encode(10, "a.wav", ["-c:a", "adpcm_ima_wav"]);
    await expect(inspect(adpcm)).rejects.toThrow(/uncompressed WAV/);
  });

  it("refuses LAME VBR without a Xing frame and measures it with one", async () => {
    const vbr = ["-c:a", "libmp3lame", "-q:a", "2"];
    const bare = await encode(20, "a.mp3", [...vbr, "-write_xing", "0"]);
    await expect(inspect(bare)).rejects.toThrow(/constant bitrate/);
    const tagged = await encode(20, "a.mp3", vbr);
    expect((await inspect(tagged)).duration).toBeCloseTo(20, 0);
  });

  it("measures constant-bitrate MP3 without a Xing frame from its size", async () => {
    const cbr = ["-c:a", "libmp3lame", "-b:a", "128k", "-write_xing", "0"];
    expect(
      (await inspect(await encode(20, "a.mp3", cbr))).duration,
    ).toBeCloseTo(20, 0);
  });
});

describe("one upload rule for both adapters", () => {
  it("accepts aliases but serves the canonical type", () => {
    expect(uploadType("audio/x-wav")).toEqual({
      kind: "audio",
      contentType: "audio/wav",
    });
    expect(uploadType("image/png; charset=binary")?.kind).toBe("image");
    expect(uploadType("constructor")).toBeUndefined();
    expect(uploadType("video/quicktime")).toBeUndefined();
  });

  it("makes the bytes prove the declared type", async () => {
    const bytes = flac(88200);
    await expect(
      inspectUpload(uploadType("audio/wav")!, bytes.length, reader(bytes)),
    ).rejects.toThrow(MISMATCH_MESSAGE);
    const png = new Uint8Array(await readFile("tests/fixtures/reference.png"));
    expect(
      await inspectUpload(uploadType("image/png")!, png.length, reader(png)),
    ).toMatchObject({ contentType: "image/png" });
    await expect(
      inspectUpload(uploadType("image/jpeg")!, png.length, reader(png)),
    ).rejects.toThrow(MISMATCH_MESSAGE);
    const clip = new Uint8Array(await readFile("tests/fixtures/metadata.mp4"));
    expect(
      await inspectUpload(uploadType("video/mp4")!, clip.length, reader(clip)),
    ).toMatchObject({ width: 960, height: 528 });
  });

  it("keeps audio and images out of every video path", () => {
    expect(isVideoSource({})).toBe(true);
    expect(isVideoSource({ mediaType: "video" })).toBe(true);
    expect(isVideoSource({ mediaType: "image" })).toBe(false);
    expect(isVideoSource({ mediaType: "audio" })).toBe(false);
  });
});
