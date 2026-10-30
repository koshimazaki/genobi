import { describe, expect, it } from "vitest";
import {
  chunkRanges,
  hasSpeech,
  planChunks,
  readFloat32,
  SAMPLE_RATE,
  voicedThreshold,
  windowLevels,
} from "../server/voice-audio";

// The chunker and the silence gate, on synthetic 16 kHz sample arrays.
const seconds = (s: number) => Math.round(s * SAMPLE_RATE);
/** A seeded hiss, so the tests do not depend on Math.random. */
function noise(length: number, amplitude: number, seed = 7) {
  const samples = new Float32Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    samples[i] = ((state / 0x7fffffff) * 2 - 1) * amplitude;
  }
  return samples;
}
/** Speech stand-in: a 220 Hz tone with a syllable-rate envelope. */
function voice(length: number, amplitude = 0.2) {
  return Float32Array.from(
    { length },
    (_, i) =>
      Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) *
      amplitude *
      (0.6 + 0.4 * Math.sin((2 * Math.PI * 4 * i) / SAMPLE_RATE)),
  );
}
const join = (...parts: Float32Array[]) => {
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
};

describe("the 28-second chunker", () => {
  it("keeps a short note whole", () => {
    expect(chunkRanges(voice(seconds(7)))).toEqual([
      { start: 0, end: seconds(7) },
    ]);
  });

  it("cuts at the quiet point between 22 and 28 seconds", () => {
    const samples = join(
      voice(seconds(25)),
      new Float32Array(seconds(0.5)),
      voice(seconds(20)),
    );
    const chunks = chunkRanges(samples);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].end / SAMPLE_RATE).toBeGreaterThanOrEqual(25);
    expect(chunks[0].end / SAMPLE_RATE).toBeLessThanOrEqual(25.5);
    expect(chunks[1]).toEqual({ start: chunks[0].end, end: samples.length });
  });

  it("cuts at 28 seconds when speech never pauses, covering every sample", () => {
    const samples = voice(seconds(70));
    const chunks = chunkRanges(samples);
    expect(chunks.map((c) => c.end - c.start)).toEqual([
      seconds(28),
      seconds(28),
      seconds(14),
    ]);
    chunks.slice(1).forEach((c, i) => expect(c.start).toBe(chunks[i].end));
  });
});

describe("the silence gate", () => {
  it("measures 20 ms windows with WIE's rms and peak blend", () => {
    const levels = windowLevels(new Float32Array(seconds(0.1)).fill(0.5));
    expect(levels).toHaveLength(5);
    expect(levels[0]).toBeCloseTo(0.5 * 0.78 + 0.5 * 0.22, 6);
  });

  it("sets the threshold from the room, within bounds", () => {
    expect(voicedThreshold(windowLevels(noise(seconds(2), 0.001)))).toBe(0.012);
    expect(voicedThreshold(windowLevels(noise(seconds(2), 0.3)))).toBe(0.05);
  });

  it("drops room tone and keeps a short word", () => {
    const room = noise(seconds(3), 0.002);
    expect(hasSpeech(room, { start: 0, end: room.length }, 0.012)).toBe(false);
    const word = join(room, voice(seconds(0.3)), room);
    expect(hasSpeech(word, { start: 0, end: word.length }, 0.012)).toBe(true);
  });

  it("never sends a silent tail chunk to the model", () => {
    // 40 s of speech, then 30 s of room: cuts at 28 s and at the room's
    // first quiet window after 50 s, so the tail chunk is room tone only,
    // where Qwen echoed its context.
    const samples = join(voice(seconds(40)), noise(seconds(30), 0.002));
    const plan = planChunks(samples);
    expect(plan.map((c) => c.speech)).toEqual([true, true, false]);
    expect(planChunks(noise(seconds(5), 0.002)).some((c) => c.speech)).toBe(
      false,
    );
  });
});

describe("ffmpeg's f32le output", () => {
  it("reads little-endian floats and zeroes non-finite ones", () => {
    const bytes = new Uint8Array(12);
    const view = new DataView(bytes.buffer);
    view.setFloat32(0, 0.25, true);
    view.setFloat32(4, Number.NaN, true);
    view.setFloat32(8, -1, true);
    expect([...readFloat32(bytes)]).toEqual([0.25, 0, -1]);
  });
});
