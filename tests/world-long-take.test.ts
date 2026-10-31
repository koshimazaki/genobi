import { describe, expect, it } from "vitest";
import {
  analyseBands,
  audioWav,
  rmsEnvelope,
} from "../src/world-builder/audio";
import { compactAudioEnvelope } from "../src/world-builder/audio-envelope";
import { avatarPoseAt } from "../src/world-builder/avatar-path";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { inputSignalRecipe } from "../src/world-builder/input-take-session";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { cameraAt, validateRecipe } from "../src/world-builder/recipe";
import { reconcileDuration } from "../src/world-builder/take-duration";
import { readDeployInput } from "../shared/comfy/deploy-input";

describe("thirty-second local take contract", () => {
  it("retimes scene and camera endpoints to frame720 and keeps later character keys valid", () => {
    const before = createMotionPreset("city-to-loft"),
      recipe = validateRecipe({
        ...validateRecipe(
          reconcileDuration(before, { ...before, seconds: 30 }),
        ),
        avatarMotion: [{ clip: "walk", seconds: 30 }],
        avatarPath: [{ frame: 720, pose: { x: 6, y: 1, z: -4, yaw: 0.2 } }],
      });
    expect(recipe.frames).toBe(721);
    expect(recipe.motion!.stateKeys.map((key) => key.frame)).toEqual([
      0, 360, 720,
    ]);
    expect(recipe.cameraMotion!.keys.map((key) => key.frame)).toEqual([
      0, 360, 720,
    ]);
    expect(cameraAt(recipe, 720)).toEqual(cameraAt(before, before.frames - 1));
    expect(avatarPoseAt(recipe, 720)).toEqual({
      x: 6,
      y: 1,
      z: -4,
      yaw: 0.2,
    });
    const end = evaluateScene(recipe, 720);
    evaluateScene(recipe, 0);
    expect(evaluateScene(recipe, 720)).toEqual(end);
    expect(() =>
      validateRecipe({ ...recipe, seconds: null, frames: 729 }),
    ).toThrow();
  });

  it("preserves short precision and bounds longer prepared sample error to0.00005", () => {
    const short = Array.from({ length: 241 }, (_, i) =>
        Math.abs(Math.sin(i + 0.1283)),
      ),
      long = Array.from({ length: 721 }, (_, i) =>
        Math.abs(Math.sin(i + 0.1283)),
      );
    expect(compactAudioEnvelope(short)).toEqual(short);
    const prepared = compactAudioEnvelope(long);
    expect(prepared).toHaveLength(721);
    prepared.forEach((value, i) => {
      expect(Math.abs(value - long[i])).toBeLessThanOrEqual(0.00005000000001);
      expect(value).toBe(Number(value.toFixed(4)));
    });
    expect(long[0]).toBe(Math.abs(Math.sin(0.1283)));
  });

  it("uses the same compact level/sub/low/mid/high samples in saved recipes and replay", () => {
    const rate = 6000,
      perFrame = rate / 24,
      channel = Float32Array.from(
        { length: 721 * perFrame },
        (_, i) =>
          (0.35 + 0.2 * Math.sin(i / perFrame / 21)) *
          Math.sin((2 * Math.PI * 51 * i) / rate),
      ),
      shortChannel = channel.slice(0, 241 * perFrame),
      level = rmsEnvelope([channel], rate),
      bands = analyseBands([channel], rate),
      shortLevel = rmsEnvelope([shortChannel], rate),
      shortBands = analyseBands([shortChannel], rate);
    for (const [long, short] of [
      [level, shortLevel],
      [bands.sub, shortBands.sub],
      [bands.low, shortBands.low],
      [bands.mid, shortBands.mid],
      [bands.high, shortBands.high],
    ]) {
      expect(long).toHaveLength(721);
      expect(short).toHaveLength(241);
      short.forEach((value, i) =>
        expect(long[i]).toBe(Math.round(value * 10_000) / 10_000),
      );
    }
    const base = createMotionPreset("voxel-architecture-128"),
      recipe = validateRecipe({
        ...validateRecipe(reconcileDuration(base, { ...base, seconds: 30 })),
        envelope: level,
        bandEnvelopes: bands,
      }),
      saved = validateRecipe(JSON.parse(JSON.stringify(recipe)));
    expect(saved.envelope).toEqual(level);
    expect(saved.bandEnvelopes).toEqual(bands);
    expect(evaluateScene(saved, 720)).toEqual(evaluateScene(recipe, 720));
    expect(JSON.stringify(saved).length).toBeLessThanOrEqual(64_000);
    expect(() => validateRecipe({ envelope: Array(722).fill(0) })).toThrow(
      /envelope/,
    );
    const precise = Array.from({ length: 721 }, (_, i) =>
      Math.abs(Math.sin(i + 0.1283)),
    );
    expect(() =>
      validateRecipe({
        ...recipe,
        envelope: precise,
        bandEnvelopes: {
          sub: precise,
          low: precise,
          mid: precise,
          high: precise,
        },
      }),
    ).toThrow(/64 KB.*Reduce/);
  });

  it("reaches the last live-input sample and exports audio for the full721-frame duration", async () => {
    const base = validateRecipe({ seconds: 30, envelope: Array(721).fill(1) }),
      transient = inputSignalRecipe(base, 720, {
        level: 0.5,
        sub: 0.4,
        low: 0.3,
        mid: 0.2,
        high: 0.1,
      });
    expect(transient.envelope).toHaveLength(721);
    expect(transient.envelope.slice(0, 720).every((value) => value === 0)).toBe(
      true,
    );
    expect(transient.envelope[720]).toBe(0.5);
    expect(validateRecipe(transient)).toEqual(transient);
    expect(() =>
      inputSignalRecipe(base, 721, {
        level: 0,
        sub: 0,
        low: 0,
        mid: 0,
        high: 0,
      }),
    ).toThrow(/outside/);
    const wav = audioWav(
      {
        channels: [new Float32Array(480 * 31)],
        sampleRate: 480,
        envelope: [],
      },
      base.frames / base.fps,
    );
    const bytes = new DataView(await wav.arrayBuffer());
    expect(bytes.getUint32(40, true) / 2 / 480).toBe(721 / 24);
  });

  it("keeps the fixed193-frame paid deployment boundary unchanged", () => {
    const recipe = validateRecipe({ seconds: 30, width: 1024, height: 576 });
    expect(() =>
      readDeployInput({
        seed: 0,
        negativePrompt: "",
        assets: {},
        recipe: JSON.stringify(recipe),
      }),
    ).toThrow(/193-frame/);
  });
});
