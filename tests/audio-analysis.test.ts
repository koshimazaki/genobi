import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyseAudio } from "../shared/audio-analysis";
import {
  fitGrid,
  gridFromBeats,
  gridWithEvidence,
} from "../shared/audio-report";
import {
  beatTimes,
  buildUpAndDrop,
  clickTrack,
  kicksAt,
  random,
  RATE,
  snaresAt,
  swell,
} from "./audio-signals";

// Genobi's own analysis on synthetic signals whose answers are known.
const near = (times: number[], t: number) =>
  Math.min(...times.map((o) => Math.abs(o - t)));

describe("the beat grid", () => {
  it.each([
    [98, 0.37],
    [128, 0.05],
    [72, 0.2],
    [174, 0.11],
  ])("recovers a %s BPM click track within 1 BPM and 10 ms", (bpm, offset) => {
    const { grid, composition } = analyseAudio(
      clickTrack(bpm, offset, 30),
      RATE,
    );
    expect(Math.abs(grid!.bpm - bpm)).toBeLessThan(1);
    expect(Math.abs(grid!.firstBeatSeconds - offset)).toBeLessThan(0.01);
    expect(grid).toMatchObject({ beatsPerBar: 4 });
    expect(grid!.confidence).toBeGreaterThan(0.9);
    // The composition's offset is a grid beat inside the first bar.
    const beats = (composition!.beatOffsetSeconds - offset) / (60 / bpm);
    expect(Math.abs(beats - Math.round(beats))).toBeLessThan(0.02);
    expect(composition!.beatOffsetSeconds).toBeLessThan((4 * 60) / bpm);
    expect(Object.keys(composition!).sort()).toEqual([
      "beatOffsetSeconds",
      "beatsPerBar",
      "bpm",
    ]);
  });

  it("fits a straight line through beats that wobble, skip and double", () => {
    const next = random(11);
    const period = 60 / 98;
    const beats = Array.from(
      { length: 64 },
      (_, k) => 0.37 + k * period + (next() - 0.5) * 0.1,
    ).filter((_, k) => k !== 20);
    beats.splice(40, 0, beats[39] + 0.2); // a stray onset between beats
    const line = fitGrid(beats)!;
    expect(Math.abs(60 / line.period - 98)).toBeLessThan(0.5);
    expect(Math.abs(line.offset - 0.37)).toBeLessThan(0.02);
    expect(line.kept.filter((k) => !k).length).toBeGreaterThanOrEqual(1);
  });

  describe("a detection between beats does not move the grid", () => {
    const exact = Array.from({ length: 16 }, (_, k) => 0.37 + k * 0.5);
    const sorted = (extra: number[]) =>
      [...exact, ...extra].sort((a, b) => a - b);
    it.each([
      ["one exactly halfway (the review's case)", sorted([4.12])],
      ["two halfway", sorted([2.12, 6.12])],
      ["a third of a beat after one", sorted([3.037])],
      ["one halfway before the first beat", sorted([0.12])],
      [
        "one halfway, with a beat missed",
        sorted([4.12]).filter((t) => t !== 5.37),
      ],
    ])("%s", (_name, beats) => {
      const line = fitGrid(beats)!;
      expect(60 / line.period).toBeCloseTo(120, 2);
      expect(Math.abs(line.offset - 0.37)).toBeLessThan(0.002);
      expect(line.kept.filter((k) => !k).length).toBe(
        beats.length - exact.filter((t) => beats.includes(t)).length,
      );
      const { grid } = gridFromBeats(
        beats,
        beats.map(() => 1),
      );
      expect(grid!.bpm).toBeCloseTo(120, 6);
      expect(grid!.firstBeatSeconds).toBe(0.37);
    });
  });

  it("keeps the fitted tempo unrounded, so a long grid does not drift", () => {
    const period = 60 / 60.0049;
    const beats = Array.from({ length: 1200 }, (_, k) => 0.25 + k * period);
    const { composition, grid } = gridFromBeats(
      beats,
      beats.map(() => 1),
    );
    expect(grid!.bpm).toBeCloseTo(60.0049, 6);
    const step = 60 / composition!.bpm;
    const last = beats.at(-1)!;
    const k = Math.round((last - composition!.beatOffsetSeconds) / step);
    expect(
      Math.abs(composition!.beatOffsetSeconds + k * step - last),
    ).toBeLessThan(0.001);
  });

  it("puts the downbeat on the beat with the most low-band energy", () => {
    const period = 60 / 120;
    const beats = Array.from({ length: 32 }, (_, k) => 0.25 + k * period);
    const energy = beats.map((_, k) => (k % 4 === 2 ? 3 : 1));
    const { downbeat, composition } = gridFromBeats(beats, energy);
    expect(downbeat).toMatchObject({ estimate: true, confidence: 1 });
    expect(composition!.beatOffsetSeconds).toBeCloseTo(1.25, 3);
  });

  it("finds the downbeat of a bar with a louder first kick, as an estimate", () => {
    const period = 60 / 110;
    const times = beatTimes(110, 0.4, 30);
    const x = clickTrack(110, 0.4, 30);
    const bars = kicksAt(
      times.filter((_, k) => k % 4 === 1),
      30,
    );
    x.forEach((_, i) => (x[i] += bars[i]));
    const { downbeat, composition } = analyseAudio(x, RATE);
    expect(downbeat!.estimate).toBe(true);
    expect(downbeat!.confidence).toBeGreaterThan(0.5);
    expect(composition!.beatOffsetSeconds).toBeCloseTo(0.4 + period, 1);
  });

  it.each([20, 60, 1000])(
    "finds no beat in a sustained %s Hz tone, which has no attacks",
    (hz) => {
      const tone = new Float32Array(RATE * 15).map(
        (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE),
      );
      const report = analyseAudio(tone, RATE);
      expect(report).toMatchObject({
        beatFound: false,
        grid: null,
        downbeat: null,
        composition: null,
        onsets: { snare: [], hat: [] },
      });
      // At most the tone's own start, never a repeating "kick".
      expect(report.onsets.kick.length).toBeLessThanOrEqual(1);
      expect(report.onsets.kick.every((t) => t < 0.1)).toBe(true);
    },
  );

  it("finds the 120 BPM grid in the bundle's pulse fixture", () => {
    const bytes = readFileSync(
      new URL(
        "../docs/director-bundle/example/media/pulse.wav",
        import.meta.url,
      ),
    );
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const rate = view.getUint32(24, true);
    const count = Math.floor(((bytes.length - 44) / 2) * (RATE / rate));
    const samples = new Float32Array(count).map(
      (_, i) =>
        view.getInt16(44 + Math.floor((i * rate) / RATE) * 2, true) / 32768,
    );
    const report = analyseAudio(samples, RATE);
    expect(report.beatFound).toBe(true);
    expect(report.grid!.bpm).toBeCloseTo(120, 0);
    expect(report.onsets.kick.length).toBeGreaterThan(8);
  });

  it("finds no beat when tracked beats miss the onsets", () => {
    const beats = Array.from({ length: 16 }, (_, k) => 0.5 + k * 0.5);
    const energy = beats.map(() => 1);
    expect(gridWithEvidence(beats, energy, [0.75, 1.75]).beatFound).toBe(false);
    const heard = gridWithEvidence(beats, energy, beats.slice(0, 12));
    expect(heard.beatFound).toBe(true);
    // Twelve of sixteen beats on an onset scale the confidence to 0.75.
    expect(heard.grid!.confidence).toBeCloseTo(0.75, 2);
  });

  it("reports no grid, onsets or moments for silence", () => {
    const report = analyseAudio(new Float32Array(RATE * 5), RATE);
    expect(report).toMatchObject({
      beatFound: false,
      grid: null,
      downbeat: null,
      composition: null,
      onsets: { kick: [], snare: [], hat: [], truncated: false },
      moments: [],
      librosa: { status: "not-requested" },
    });
    expect(report.durationSeconds).toBe(5);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "refuses a sample of %s rather than analysing around it",
    (bad) => {
      const clicks = clickTrack(120, 0.1, 5);
      clicks[RATE * 2] = bad;
      expect(() => analyseAudio(clicks, RATE)).toThrow(
        expect.objectContaining({ code: "audio_not_finite" }),
      );
    },
  );

  it("refuses under half a second", () => {
    expect(() => analyseAudio(new Float32Array(1000), RATE)).toThrow();
  });
});

describe("onsets per band", () => {
  const times = [0.5, 1.3, 2.05, 3.0, 3.6, 4.45];

  it("places kicks in the low band where they were struck", () => {
    const { onsets } = analyseAudio(kicksAt(times, 6), RATE);
    expect(onsets.kick).toHaveLength(times.length);
    for (const t of times) expect(near(onsets.kick, t)).toBeLessThan(0.015);
  });

  it("places noise hits in the snare band", () => {
    const { onsets } = analyseAudio(snaresAt(times, 6), RATE);
    expect(onsets.snare).toHaveLength(times.length);
    for (const t of times) expect(near(onsets.snare, t)).toBeLessThan(0.015);
  });
});

describe("intensity and key moments", () => {
  it("finds a build-up that ends in a drop", () => {
    const { moments, intensity } = analyseAudio(buildUpAndDrop(), RATE);
    const drop = moments.find((m) => m.kind === "drop")!;
    const build = moments.find((m) => m.kind === "build-up")!;
    expect(Math.abs(drop.startSeconds - 10.3)).toBeLessThan(0.15);
    expect(drop.changeDb).toBeGreaterThan(6);
    expect(build.endSeconds).toBe(drop.startSeconds);
    expect(build.startSeconds).toBeLessThan(3);
    expect(moments.filter((m) => m.kind === "crescendo")).toEqual([]);
    expect(intensity.stepSeconds).toBe(0.1);
    expect(intensity.values).toHaveLength(200);
    expect(Math.max(...intensity.values)).toBe(1);
  });

  it("calls a long rise with no drop a crescendo", () => {
    const { moments } = analyseAudio(swell(), RATE);
    expect(moments.map((m) => m.kind)).toEqual(["crescendo"]);
    expect(moments[0].changeDb).toBeGreaterThan(20);
  });
});
