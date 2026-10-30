import { describe, expect, it } from "vitest";
import { inspectAudio } from "../shared/audio";
import {
  ease,
  LED_COUNT,
  ledLevel,
  measure,
  parseColor,
  pushLevel,
  ramp,
} from "../src/voice/levels";
import { MAX_VOICE_SECONDS } from "../server/voice";
import { encodeWav, limitSamples } from "../src/voice/wav";

// The LED waveform's WIE level formula and the WAV the studio sends.
describe("the LED levels", () => {
  it("follows WIE: rms × 0.78 + peak × 0.22, gate 0.006, (x × 7.5)^0.72", () => {
    expect(ledLevel(0, 0)).toBe(0);
    // Under the gate: silence and room tone stay dots.
    expect(ledLevel(0.005, 0.0075)).toBe(0);
    const expected = Math.pow((0.05 * 0.78 + 0.2 * 0.22 - 0.006) * 7.5, 0.72);
    expect(ledLevel(0.05, 0.2)).toBeCloseTo(expected, 10);
    expect(ledLevel(1, 1)).toBe(1);
    expect(ledLevel(Number.NaN, 0.1)).toBeCloseTo(
      Math.pow((0.1 * 0.22 - 0.006) * 7.5, 0.72),
    );
  });

  it("measures a block and shifts the newest level in on the right", () => {
    expect(measure(Float32Array.from([0.5, -0.5, 0.5, -0.5]))).toEqual({
      rms: 0.5,
      peak: 0.5,
    });
    const levels = new Float32Array(LED_COUNT);
    expect(LED_COUNT).toBe(48);
    pushLevel(levels, 0.7);
    pushLevel(levels, 2);
    expect(levels[46]).toBeCloseTo(0.7);
    expect(levels[47]).toBe(1);
  });

  it("eases at 0.24 per 60 Hz frame, or at once for reduced motion", () => {
    const shown = new Float32Array(1);
    ease(shown, Float32Array.of(1), 1 / 60, false);
    expect(shown[0]).toBeCloseTo(0.24);
    ease(shown, Float32Array.of(1), 1 / 60, true);
    expect(shown[0]).toBe(1);
  });

  it("builds a theme ramp from CSS colours", () => {
    expect(parseColor("#a8be5c")).toEqual([168, 190, 92]);
    expect(parseColor(" rgb(1, 2, 3) ")).toEqual([1, 2, 3]);
    expect(parseColor("var(--x)")).toBeNull();
    const colours = ramp([
      [0, 0, 0],
      [255, 255, 255],
    ]);
    expect(colours).toHaveLength(32);
    expect(colours[0]).toEqual([0, 0, 0]);
    expect(colours[31]).toEqual([255, 255, 255]);
  });
});

describe("the recording the studio sends", () => {
  it("is a 16 kHz mono WAV the shared reader measures exactly", async () => {
    const bytes = encodeWav(new Float32Array(16_000 * 3).fill(0.1));
    const found = await inspectAudio(
      bytes.length,
      async (at, length) => bytes.slice(at, at + length).buffer,
    );
    expect(found).toMatchObject({ contentType: "audio/wav", duration: 3 });
  });

  it("keeps at most the limit when the stop timer fires late", async () => {
    // A stop that ran a second and a half late: 181.5 s at 16 kHz.
    const late = new Float32Array(Math.round(16_000 * 181.5)).fill(0.1);
    const kept = limitSamples(late, 16_000, MAX_VOICE_SECONDS);
    expect(kept.length).toBe(16_000 * MAX_VOICE_SECONDS);
    const bytes = encodeWav(kept);
    const found = await inspectAudio(
      bytes.length,
      async (at, length) => bytes.slice(at, at + length).buffer,
    );
    // The server refuses only what is longer than its limit.
    expect(found.duration).toBe(MAX_VOICE_SECONDS);
    const short = new Float32Array(16_000);
    expect(limitSamples(short, 16_000, MAX_VOICE_SECONDS)).toBe(short);
  });
});
