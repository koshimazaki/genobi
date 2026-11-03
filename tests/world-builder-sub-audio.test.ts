import { describe, expect, it } from "vitest";
import { analyseBands } from "../src/world-builder/audio";
import {
  analyseSubBand,
  normalizeBandEnvelopes,
} from "../src/world-builder/audio-bands";
import {
  createRoute,
  routeValue,
  type RouteSignals,
} from "../src/world-builder/mod-routes";
import { defaultRecipe, validateRecipe } from "../src/world-builder/recipe";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { createMotionPreset } from "../src/world-builder/motion-presets";

const rate = 24000;
const tone = (hz: number, seconds = 1) =>
  Float32Array.from(
    { length: Math.round(rate * seconds) },
    (_, i) => 0.6 * Math.sin((2 * Math.PI * hz * i) / rate),
  );
const steady = (frames: number[]) => {
  const settled = frames.slice(4);
  return settled.reduce((sum, value) => sum + value, 0) / settled.length;
};

describe("measured sub-band control audio", () => {
  it("measures 20–80 Hz independently of bass and rejects DC and higher tones", () => {
    const sub = steady(analyseSubBand([tone(40)], rate));
    expect(sub).toBeGreaterThan(0.35);
    expect(sub).toBeLessThan(0.45);
    expect(steady(analyseSubBand([tone(5)], rate))).toBeLessThan(sub / 10);
    expect(steady(analyseSubBand([tone(400)], rate))).toBeLessThan(sub / 15);
    expect(
      steady(analyseSubBand([new Float32Array(rate).fill(0.6)], rate)),
    ).toBeLessThan(0.001);
    const bass = analyseBands([tone(180)], rate);
    expect(steady(bass.low)).toBeGreaterThan(steady(bass.sub) * 3);
  });

  it("keeps channel energy without cancelling opposite stereo phases, with bounded deterministic frames", () => {
    const left = tone(40),
      right = left.map((v) => -v);
    const mono = analyseSubBand([left], rate);
    analyseSubBand([left, right], rate).forEach((value, frame) =>
      expect(value).toBeCloseTo(mono[frame], 12),
    );
    expect(analyseSubBand([left], rate)).toEqual(mono);
    expect(analyseSubBand([new Float32Array(rate)], rate)).toEqual(
      Array(24).fill(0),
    );
    expect(analyseSubBand([tone(40, 32)], rate)).toHaveLength(721);
    expect(analyseSubBand([], rate)).toEqual([]);
    expect(() => analyseSubBand([left], Number.NaN)).toThrow("analysis rate");
  });

  it("normalizes old recipes without inventing sub audio, and validates every supplied sample", () => {
    const old = { low: [0.7], mid: [0.1], high: [] };
    const normalized = normalizeBandEnvelopes(old);
    expect(normalized).toEqual({ ...old, sub: [] });
    normalized.low[0] = 0;
    expect(old.low[0]).toBe(0.7);
    expect(validateRecipe({ bandEnvelopes: old }).bandEnvelopes.sub).toEqual(
      [],
    );
    for (const sub of [
      undefined,
      null,
      [Number.NaN],
      [Infinity],
      [-0.1],
      [1.1],
      Array(722).fill(0),
    ])
      expect(() => normalizeBandEnvelopes({ ...old, sub })).toThrow(
        "audio routing",
      );
    expect(() => normalizeBandEnvelopes({ ...old, bass: [0.5] })).toThrow(
      "audio routing",
    );
    expect(normalizeBandEnvelopes({ ...old, sub: [0.25] }).sub).toEqual([0.25]);
  });

  it("routes actual sub energy without substituting low for missing audio", () => {
    const route = createRoute({
      source: "sub",
      amount: 1,
      threshold: 0,
      lerp: 1,
    });
    const signals: RouteSignals = {
      ...defaultRecipe,
      bandEnvelopes: { low: [0.9], mid: [], high: [] },
      audioRoutes: [route],
    };
    expect(routeValue(signals, route, 0)).toBe(0);
    expect(routeValue(signals, { ...route, invert: true }, 0)).toBe(0);
    const measured = validateRecipe({
      ...signals,
      bandEnvelopes: { ...signals.bandEnvelopes, sub: [0.2] },
    });
    expect(routeValue(measured, measured.audioRoutes[0], 0)).toBe(0.2);
  });

  it("keeps seeking deterministic for scene mappings from the measured sub envelope", () => {
    const recipe = createMotionPreset("voxel-architecture");
    recipe.motion!.mappings = [
      {
        id: "sub-twist",
        enabled: true,
        source: "sub",
        property: "twistY",
        amount: 1,
      },
    ];
    recipe.bandEnvelopes = { low: [0.9], mid: [], high: [], sub: [0.25, 0.5] };
    const valid = validateRecipe(recipe);
    const at1 = evaluateScene(valid, 1);
    evaluateScene(valid, 0);
    expect(evaluateScene(valid, 1)).toEqual(at1);
    const absent = validateRecipe({
      ...valid,
      bandEnvelopes: { low: [0.9], mid: [], high: [] },
    });
    expect(evaluateScene(absent, 0).controls.twistY).toBe(
      evaluateScene(absent, 0, { audio: false }).controls.twistY,
    );
  });
});
