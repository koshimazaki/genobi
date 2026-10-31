import { describe, expect, it } from "vitest";
import {
  acousticWeightsAt,
  buildAcousticSchedule,
  validateAcousticSchedule,
  type AcousticSchedule,
} from "../src/world-builder/acoustic-schedule";
import {
  renderDynamicRoomAudio,
  type RoomConvolver,
} from "../src/world-builder/dynamic-room-audio";
import {
  buildRoomImpulse,
  roomImpulseKey,
  ROOM_AUDIO_ENGINE,
  type AcousticRoom,
} from "../src/world-builder/scene-room-ir";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { validateRecipe } from "../src/world-builder/recipe";

const rate = 8000;
const room = (): AcousticRoom => ({
  id: "room",
  dimensions: [4, 3, 4],
  center: [0, 0, 0],
  source: [-1, 1, 0],
  listener: [1, 1, 0],
  absorption: {
    floor: 0.3,
    ceiling: 0.2,
    north: 0.2,
    south: 0.2,
    east: 0.2,
    west: 0.2,
  },
  seed: 42,
});
const recipe = () =>
  validateRecipe({
    objects: [],
    audioRoutes: [],
    motion: {
      version: 1,
      pivot: [0, 0, 0],
      intensity: 1,
      mappings: [],
      room: { ...room(), wallThickness: 0.1, visible: true, cutaway: true },
      stateKeys: [
        {
          id: "a",
          label: "Small",
          frame: 0,
          easing: "easeInOut",
          objects: {},
          room: { dimensions: [4, 3, 4] },
        },
        {
          id: "b",
          label: "Big",
          frame: 96,
          easing: "easeInOut",
          objects: {},
          room: { dimensions: [8, 5, 7] },
        },
      ],
    },
  });
const schedule = (dynamic = true): AcousticSchedule => ({
  version: 1,
  engine: ROOM_AUDIO_ENGINE,
  treatment: dynamic ? "dynamic" : "static",
  frames: 9,
  fps: 24,
  duration: 9 / 24,
  sampleEveryFrames: 4,
  maxIRSeconds: 0.1,
  interpolation: "linear-wet-crossfade",
  controlAudio: "frozen-recipe-envelopes",
  snapshots: dynamic
    ? [
        { frame: 0, room: room() },
        { frame: 4, room: { ...room(), dimensions: [5, 4, 5] } },
        { frame: 8, room: { ...room(), dimensions: [6, 5, 7] } },
      ]
    : [{ frame: 0, room: room() }],
});
const track = (samples: Float32Array[]) => ({
  channels: samples,
  sampleRate: rate,
  envelope: [0.9],
});
function impulse(at: number, gain = 0.1) {
  const samples = new Float32Array(3000);
  samples[at] = gain;
  return samples;
}
/** Exact full convolution oracle, intentionally small fixtures (8 kHz, 0.1 s IR). */
const convolve: RoomConvolver = async (channels, ir, _rate, length) =>
  channels.map((source) => {
    const out = new Float32Array(length);
    for (let i = 0; i < source.length; i++) {
      if (source[i] === 0) continue;
      for (let j = 0; j < ir.length && i + j < length; j++)
        out[i + j] += source[i] * ir[j];
    }
    return out;
  });
const energy = (samples: Float32Array) =>
  samples.reduce((sum, n) => sum + n * n, 0);

describe("frozen acoustic schedules", () => {
  it("uses exactly the evaluated picture geometry, including its endpoints", () => {
    const input = recipe();
    const rendered = buildAcousticSchedule(input, { sampleEveryFrames: 12 });
    expect(rendered.duration).toBe(input.frames / input.fps);
    expect(rendered.treatment).toBe("dynamic");
    expect(rendered.snapshots.map((s) => s.frame)).toEqual([
      0, 12, 24, 36, 48, 60, 72, 84, 96,
    ]);
    for (const snapshot of rendered.snapshots)
      expect(evaluateScene(input, snapshot.frame).room!).toMatchObject(
        snapshot.room,
      );
    input.motion!.room!.dimensions[0] = 31;
    expect(rendered.snapshots[0].room.dimensions[0]).toBe(4);
  });
  it("bounds schedule work and explicitly supports frame-zero static treatment", () => {
    const small = buildAcousticSchedule(recipe(), {
      maxSnapshots: 4,
      sampleEveryFrames: 1,
    });
    expect(small.snapshots).toHaveLength(4);
    expect(small.snapshots.at(-1)?.frame).toBe(96);
    const fixed = buildAcousticSchedule(recipe(), { static: true });
    expect(fixed.treatment).toBe("static");
    expect(fixed.snapshots).toHaveLength(1);
    expect(() =>
      buildAcousticSchedule(recipe(), { maxSnapshots: 25 }),
    ).toThrow();
    expect(() => buildAcousticSchedule(validateRecipe({}))).toThrow(
      /explicit acoustic room/,
    );
  });
  it("uses frozen control-band offsets after state interpolation, without replacing the control track", () => {
    const input = recipe();
    const base = buildAcousticSchedule(input);
    input.motion!.mappings = [
      {
        id: "bass-width",
        source: "low",
        property: "roomWidth",
        amount: 1,
        enabled: true,
      },
    ];
    input.bandEnvelopes.low = Array(input.frames).fill(0.5);
    const driven = buildAcousticSchedule(input);
    for (let i = 0; i < driven.snapshots.length; i++) {
      expect(driven.snapshots[i].room.dimensions[0]).toBeCloseTo(
        base.snapshots[i].room.dimensions[0] + 0.5,
      );
      expect(
        evaluateScene(input, driven.snapshots[i].frame).room,
      ).toMatchObject(driven.snapshots[i].room);
    }
    expect(input.bandEnvelopes.low).toEqual(Array(input.frames).fill(0.5));
    expect(input.envelope).toEqual([]);
  });
  it("rejects changing room identity, missing endpoints and invalid allocation inputs", () => {
    const invalid = schedule();
    invalid.snapshots[1].room.id = "another-room";
    expect(() => validateAcousticSchedule(invalid)).toThrow(/identity/);
    expect(() =>
      validateAcousticSchedule({ ...schedule(), frames: 9999 }),
    ).toThrow();
    expect(() =>
      validateAcousticSchedule({
        ...schedule(),
        snapshots: schedule().snapshots.slice(0, 2),
      }),
    ).toThrow(/complete/);
    const unordered = schedule();
    unordered.snapshots[1].frame = 0;
    expect(() => validateAcousticSchedule(unordered)).toThrow(/ordered/);
  });
  it("has continuous partition-of-unity weights and holds the last room through the tail", () => {
    const s = schedule();
    for (let sample = 0; sample < 4000; sample++)
      expect(
        acousticWeightsAt(s, sample / rate).reduce(
          (sum, w) => sum + w.weight,
          0,
        ),
      ).toBeCloseTo(1, 12);
    expect(acousticWeightsAt(s, 1)).toEqual([{ index: 2, weight: 1 }]);
    expect(acousticWeightsAt(s, 2 / 24)).toEqual([
      { index: 0, weight: 0.5 },
      { index: 1, weight: 0.5 },
    ]);
  });
});

describe("deterministic shoebox responses", () => {
  it("is repeatable, unit energy and invariant to a complete room translation", () => {
    const a = buildRoomImpulse(room(), rate, 0.2);
    const b = buildRoomImpulse({ ...room(), center: [20, 5, -14] }, rate, 0.2);
    expect(a.samples).toEqual(b.samples);
    expect(energy(a.samples)).toBeCloseTo(1, 6);
    expect(a.reflections).toBeGreaterThan(6);
    expect(a.truncated).toBe(true);
    expect(a.samples.at(-1)).toBe(0);
    expect(roomImpulseKey(room(), rate, 0.2)).toBe(
      roomImpulseKey({ ...room(), center: [1, 0, 1] }, rate, 0.2),
    );
  });
  it("changes with material, source, dimensions and seed while validating bounds", () => {
    const a = buildRoomImpulse(room(), rate, 0.1);
    const source = {
      ...room(),
      source: [-1, 1, -1] as [number, number, number],
    };
    expect(buildRoomImpulse(source, rate, 0.1).samples).not.toEqual(a.samples);
    expect(
      buildRoomImpulse({ ...room(), seed: 43 }, rate, 0.1).samples,
    ).not.toEqual(a.samples);
    const damped = room();
    damped.absorption.floor = 0.8;
    expect(buildRoomImpulse(damped, rate, 0.1).rt60).toBeLessThan(a.rt60);
    expect(() =>
      buildRoomImpulse({ ...room(), source: [99, 1, 0] }, rate, 0.1),
    ).toThrow(/inside/);
    expect(() => buildRoomImpulse(room(), Infinity)).toThrow();
    expect(() => buildRoomImpulse(room(), rate, 100)).toThrow();
  });
});

describe("scheduled full-history convolution", () => {
  it("preserves pre-transition history and matches the exact time-varying response", async () => {
    const s = schedule();
    const source = impulse(1300);
    const seen: number[] = [];
    const result = await renderDynamicRoomAudio(
      track([source]),
      s,
      { dry: 0, wet: 1 },
      async (...args) => {
        seen.push(args[0][0][1300]);
        return convolve(...args);
      },
    );
    expect(seen).toHaveLength(3);
    expect(seen.every((v) => v > 0)).toBe(true);
    const impulses = s.snapshots.map(
      (entry) => buildRoomImpulse(entry.room, rate, 0.1).samples,
    );
    for (let sample = 1300; sample < 2100; sample++) {
      const expected = acousticWeightsAt(s, sample / rate).reduce(
        (sum, w) =>
          sum +
          w.weight * (impulses[w.index][sample - 1300] ?? 0) * source[1300],
        0,
      );
      expect(result.track.channels[0][sample]).toBeCloseTo(expected, 7);
    }
    expect(energy(result.track.channels[0].slice(1334, 1800))).toBeGreaterThan(
      0,
    );
    expect(result.track.envelope).toEqual([]);
    expect(result.peakGain).toBe(1);
  });
  it("preserves a final late impulse and full stereo tails without crossfeed", async () => {
    const left = impulse(2999);
    const right = impulse(2999, -0.1);
    const result = await renderDynamicRoomAudio(
      track([left, right]),
      schedule(),
      { dry: 1, wet: 1 },
      convolve,
    );
    expect(result.track.channels[0]).toHaveLength(3799);
    expect(result.tailSeconds).toBeCloseTo(799 / rate);
    expect(energy(result.track.channels[0].slice(3000))).toBeGreaterThan(0);
    result.track.channels[0].forEach((v, i) =>
      expect(v).toBeCloseTo(-result.track.channels[1][i], 7),
    );
    expect(result.wav.size).toBe(44 + 3799 * 2 * 2);
  });
  it("deduplicates identical IRs and does not dip on a sustained static tone", async () => {
    const s = schedule();
    s.snapshots = s.snapshots.map((entry) => ({ ...entry, room: room() }));
    const tone = Float32Array.from(
      { length: 3000 },
      (_, i) => 0.05 * Math.sin((2 * Math.PI * 220 * i) / rate),
    );
    let count = 0;
    const moving = await renderDynamicRoomAudio(
      track([tone]),
      s,
      {},
      async (...args) => {
        count++;
        return convolve(...args);
      },
    );
    const fixed = await renderDynamicRoomAudio(
      track([tone]),
      schedule(false),
      {},
      convolve,
    );
    expect(count).toBe(1);
    expect(moving.track.channels[0]).toEqual(fixed.track.channels[0]);
  });
  it("records deliberate trimming, fades the boundary, and uses one gain for clipping", async () => {
    const source = new Float32Array(3000).fill(2);
    const result = await renderDynamicRoomAudio(
      track([source]),
      schedule(false),
      { wet: 0, dry: 1, tail: "trim-fade" },
      convolve,
    );
    expect(result.track.channels[0]).toHaveLength(3000);
    expect(result.track.channels[0].at(-1)).toBe(0);
    expect(result.trimFadeSeconds).toBe(0.05);
    expect(result.tailSeconds).toBe(0);
    expect(result.peakGain).toBeCloseTo(0.49);
    expect(Math.max(...result.track.channels[0])).toBeCloseTo(0.98);
  });
  it("pads short dry input and clips long dry input to the same picture duration", async () => {
    const short = await renderDynamicRoomAudio(
      track([new Float32Array([0.2])]),
      schedule(false),
      { wet: 0, tail: "trim-fade" },
      convolve,
    );
    expect(short.track.channels[0]).toHaveLength(3000);
    expect(short.track.channels[0][0]).toBeCloseTo(0.2);
    expect(short.track.channels[0][100]).toBe(0);
    const long = new Float32Array(5000);
    long[4000] = 1;
    const clipped = await renderDynamicRoomAudio(
      track([long]),
      schedule(false),
      { tail: "trim-fade" },
      convolve,
    );
    expect(energy(clipped.track.channels[0])).toBe(0);
  });
  it("rejects invalid PCM and cancellation before publishing an output", async () => {
    const invalid = impulse(0);
    invalid[1] = NaN;
    await expect(
      renderDynamicRoomAudio(track([invalid]), schedule(), {}, convolve),
    ).rejects.toThrow(/invalid samples/);
    const cancel = new AbortController();
    await expect(
      renderDynamicRoomAudio(
        track([impulse(0)]),
        schedule(),
        { signal: cancel.signal },
        async (...args) => {
          cancel.abort();
          return convolve(...args);
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
