import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkerError } from "../server/voice-process";
import { audioApp } from "./audio-harness";
import { clickTrack, fakeFfmpeg, floatWav, RATE, wav16 } from "./audio-signals";
import { hasFfmpeg } from "./ffmpeg-harness";

// POST /api/audio/analyze and GET /api/audio/status on the local server:
// ownership, refusals, the cache and the optional librosa worker.
const track = wav16(clickTrack(98, 0.37, 20));

describe("the audio analysis route", () => {
  it("analyses an owned upload once and serves repeats from the cache", async () => {
    const ffmpeg = fakeFfmpeg();
    const { upload, analyze } = await audioApp(ffmpeg.run);
    const source = await upload(track, "audio/wav");
    const first = await analyze({ sourceId: source.id });
    expect(first.status).toBe(200);
    const { report } = await first.json();
    expect(report.grid.bpm).toBeCloseTo(98, 0);
    expect(Math.abs(report.grid.firstBeatSeconds - 0.37)).toBeLessThan(0.01);
    expect(report.composition).toMatchObject({
      bpm: report.grid.bpm,
      beatsPerBar: 4,
    });
    expect(report.librosa).toEqual({ status: "not-requested" });
    expect((await analyze({ sourceId: source.id })).status).toBe(200);
    expect(ffmpeg.calls.decodes).toBe(1);
  });

  it("refuses requests that name nothing, too much, or the wrong types", async () => {
    const { analyze } = await audioApp(fakeFfmpeg().run);
    for (const body of [
      {},
      [],
      { sourceId: "a", copyId: "b", assetId: "c" },
      { sourceId: "../etc" },
      { sourceId: "a", extra: 1 },
      { sourceId: "a", librosa: "yes" },
      { copyId: "song" },
    ]) {
      const response = await analyze(body);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("invalid_request");
    }
  });

  it("refuses a non-audio source and another session's audio", async () => {
    const { upload, analyze, session } = await audioApp(fakeFfmpeg().run);
    const image = await upload(
      new Uint8Array(
        await readFile(path.resolve("tests/fixtures/reference.png")),
      ),
      "image/png",
    );
    const refused = await analyze({ sourceId: image.id });
    expect(refused.status).toBe(415);
    expect((await refused.json()).code).toBe("not_audio");
    const source = await upload(track, "audio/wav");
    expect(
      (await analyze({ sourceId: source.id }, await session())).status,
    ).toBe(404);
  });

  it.each([
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
  ])(
    "refuses a float WAV holding %s and caches nothing",
    async (_name, bad) => {
      const ffmpeg = fakeFfmpeg();
      const { upload, analyze } = await audioApp(ffmpeg.run);
      const clicks = clickTrack(120, 0.1, 10);
      clicks[RATE * 3] = bad;
      const source = await upload(floatWav(clicks), "audio/wav");
      for (let attempt = 1; attempt <= 2; attempt++) {
        const response = await analyze({ sourceId: source.id });
        expect(response.status).toBe(422);
        expect((await response.json()).code).toBe("audio_not_finite");
        // Each request decodes again: the refusal was not cached.
        expect(ffmpeg.calls.decodes).toBe(attempt);
      }
    },
  );

  it.skipIf(!hasFfmpeg)(
    "refuses NaN that the real ffmpeg keeps in float32",
    async () => {
      const { upload, analyze } = await audioApp();
      const clicks = clickTrack(120, 0.1, 10);
      clicks[RATE * 3] = Number.NaN;
      const source = await upload(floatWav(clicks), "audio/wav");
      const response = await analyze({ sourceId: source.id });
      expect(response.status).toBe(422);
      expect((await response.json()).code).toBe("audio_not_finite");
    },
  );

  it("refuses audio longer than the studio keeps", async () => {
    const { upload, analyze, store } = await audioApp(fakeFfmpeg().run);
    const source = await upload(track, "audio/wav");
    store.data.sources.find((s) => s.id === source.id)!.duration = 21 * 60;
    const response = await analyze({ sourceId: source.id });
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("audio_too_long");
  });

  it("answers status with booleans only", async () => {
    const { base, cookie } = await audioApp(fakeFfmpeg().run);
    const status = await (
      await fetch(`${base}/api/audio/status`, { headers: { cookie } })
    ).json();
    expect(status).toEqual({
      available: true,
      ffmpeg: true,
      python: false,
      librosa: false,
    });
  });

  it("says librosa was unavailable when no Python is set up", async () => {
    const { upload, analyze } = await audioApp(fakeFfmpeg().run);
    const source = await upload(track, "audio/wav");
    const { report } = await (
      await analyze({ sourceId: source.id, librosa: true })
    ).json();
    expect(report.librosa).toEqual({ status: "unavailable" });
    expect(report.grid.bpm).toBeCloseTo(98, 0);
  });

  it("adds the librosa worker's view, fitted with the same grid code", async () => {
    const period = 60 / 98;
    const beats = Array.from({ length: 30 }, (_, k) => 0.37 + k * period);
    let runs = 0;
    const { upload, analyze } = await audioApp(fakeFfmpeg().run, {
      python: process.execPath,
      checkWorker: async () => true,
      runWorker: async (_command, samples, rate) => {
        runs++;
        expect(rate).toBe(22_050);
        expect(samples.length).toBe(20 * 22_050);
        return {
          event: "result",
          version: "0.11.0",
          beats: beats.map((t, k) => t + (k % 2 ? 0.04 : -0.04)),
          beatLowEnergy: beats.map((_, k) => (k % 4 === 1 ? 5 : 1)),
          onsets: { kick: beats, snare: [], hat: [] },
          sections: [8.2],
        };
      },
    });
    const source = await upload(track, "audio/wav");
    const ask = async () =>
      (await (await analyze({ sourceId: source.id, librosa: true })).json())
        .report;
    const { librosa } = await ask();
    expect(librosa).toMatchObject({
      status: "used",
      version: "0.11.0",
      sections: [8.2],
      beatFound: true,
      composition: { beatsPerBar: 4 },
    });
    expect(librosa.grid.bpm).toBeCloseTo(98, 0);
    expect(librosa.composition.beatOffsetSeconds).toBeCloseTo(0.37 + period, 2);
    await ask();
    expect(runs).toBe(1);
  });

  it("reports a failed worker by its code and keeps the core report", async () => {
    const { upload, analyze } = await audioApp(fakeFfmpeg().run, {
      python: process.execPath,
      checkWorker: async () => true,
      runWorker: async () => {
        throw new WorkerError("audio_timeout");
      },
    });
    const source = await upload(track, "audio/wav");
    const { report } = await (
      await analyze({ sourceId: source.id, librosa: true })
    ).json();
    expect(report.librosa).toEqual({ status: "failed", code: "audio_timeout" });
    expect(report.grid).not.toBeNull();
  });

  it.skipIf(!hasFfmpeg)(
    "decodes and resamples with the real ffmpeg",
    async () => {
      const { upload, analyze } = await audioApp();
      // 44.1 kHz in, 22.05 kHz analysed: each sample doubled.
      const clicks = clickTrack(128, 0.05, 15);
      const doubled = new Float32Array(clicks.length * 2).map(
        (_, i) => clicks[i >> 1],
      );
      const source = await upload(wav16(doubled, 44_100), "audio/wav");
      const { report } = await (await analyze({ sourceId: source.id })).json();
      expect(Math.abs(report.grid.bpm - 128)).toBeLessThan(1);
      expect(Math.abs(report.grid.firstBeatSeconds - 0.05)).toBeLessThan(0.01);
    },
  );
});
