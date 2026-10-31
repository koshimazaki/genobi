import { describe, expect, it } from "vitest";
import {
  buildAcousticSchedule,
  validateAcousticSchedule,
} from "../src/world-builder/acoustic-schedule";
import { renderDynamicRoomAudio } from "../src/world-builder/dynamic-room-audio";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { validateRecipe } from "../src/world-builder/recipe";
import {
  reconcileDuration,
  TAKE_FPS,
  TAKE_FRAMES,
} from "../src/world-builder/take-duration";

function longRoom() {
  const original = createMotionPreset("apartment-morph");
  return validateRecipe(
    reconcileDuration(original, { ...original, seconds: 30 }),
  );
}

describe("room sound on the expanded scene timeline", () => {
  it("accepts the full 721-frame dynamic schedule and measured sub-band response", () => {
    const recipe = longRoom();
    recipe.motion!.mappings = [
      {
        id: "late-sub-width",
        enabled: true,
        source: "sub",
        property: "roomWidth",
        amount: 0.5,
      },
    ];
    recipe.motion!.intensity = 1;
    recipe.bandEnvelopes.sub = Array.from(
      { length: recipe.frames },
      (_, frame) => (frame >= 600 ? 1 : 0),
    );
    const schedule = buildAcousticSchedule(recipe);
    expect(recipe.frames).toBe(TAKE_FRAMES.max);
    expect(schedule.duration).toBe(TAKE_FRAMES.max / TAKE_FPS);
    expect(schedule.approximation?.comparedFrames).toBe(TAKE_FRAMES.max);
    expect(schedule.snapshots.length).toBeLessThanOrEqual(24);
    expect(schedule.snapshots.at(-1)?.frame).toBe(720);
    expect(schedule.snapshots.at(-1)?.room.dimensions).toEqual(
      evaluateScene(recipe, 720).room!.dimensions,
    );
    expect(validateAcousticSchedule(schedule)).toBe(schedule);
  });

  it("keeps late dry samples and a full tail in a bounded two-snapshot render", async () => {
    const schedule = buildAcousticSchedule(longRoom(), {
      maxSnapshots: 2,
      maxIRSeconds: 0.1,
    });
    expect(schedule.snapshots.map((entry) => entry.frame)).toEqual([0, 720]);
    expect(schedule.sampleEveryFrames).toBe(720);
    const sampleRate = 8000;
    const count = Math.round(schedule.duration * sampleRate);
    const dry = new Float32Array(count);
    dry[29 * sampleRate] = 0.25;
    const calls: { input: number; output: number; lateSample: number }[] = [];
    const rendered = await renderDynamicRoomAudio(
      { sampleRate, channels: [dry], envelope: [] },
      schedule,
      { wet: 1, dry: 0, tail: "extend" },
      async (channels, _impulse, _rate, length) => {
        calls.push({
          input: channels[0].length,
          output: length,
          lateSample: channels[0][29 * sampleRate],
        });
        const output = new Float32Array(length);
        output.set(channels[0]);
        output[length - 1] = 0.125;
        return [output];
      },
    );
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.input).toBe(count);
      expect(call.output).toBeGreaterThan(count);
      expect(call.lateSample).toBe(0.25);
    }
    expect(rendered.track.channels[0][29 * sampleRate]).toBeCloseTo(0.25);
    expect(rendered.track.channels[0].at(-1)).toBeCloseTo(0.125);
    expect(rendered.tailSeconds).toBeGreaterThan(0);
    expect(rendered.wav.size).toBe(44 + rendered.track.channels[0].length * 2);
  });

  it("renders a static 30-second room with exact picture-duration trim", async () => {
    const schedule = buildAcousticSchedule(longRoom(), {
      static: true,
      maxIRSeconds: 0.1,
      sampleEveryFrames: TAKE_FRAMES.max - 1,
    });
    expect(schedule.snapshots).toHaveLength(1);
    const rendered = await renderDynamicRoomAudio(
      { sampleRate: 8000, channels: [Float32Array.of(0.2)], envelope: [] },
      schedule,
      { wet: 0, dry: 1, tail: "trim-fade" },
    );
    expect(rendered.track.channels[0].length).toBe(
      Math.round((TAKE_FRAMES.max / TAKE_FPS) * 8000),
    );
    expect(rendered.tailSeconds).toBe(0);
  });

  it("still rejects schedules beyond the shared scene bounds or off the frame grid", () => {
    const schedule = buildAcousticSchedule(longRoom(), { static: true });
    for (const frames of [TAKE_FRAMES.max + TAKE_FRAMES.step, 720])
      expect(() =>
        validateAcousticSchedule({
          ...schedule,
          frames,
          duration: frames / TAKE_FPS,
        }),
      ).toThrow(/Invalid acoustic schedule/);
    expect(() =>
      buildAcousticSchedule(longRoom(), {
        sampleEveryFrames: TAKE_FRAMES.max,
      }),
    ).toThrow(/sampling or IR limit/);
  });
});
