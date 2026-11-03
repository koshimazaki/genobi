import { describe, expect, it } from "vitest";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { validateRecipe } from "../src/world-builder/recipe";
import {
  reconcileDuration,
  TAKE_FRAMES,
} from "../src/world-builder/take-duration";
import {
  buildAcousticSchedule,
  validateAcousticSchedule,
} from "../src/world-builder/acoustic-schedule";
import {
  renderDynamicRoomAudio,
  MAX_ROOM_PCM_AMPLITUDE,
} from "../src/world-builder/dynamic-room-audio";

function fixedRoom() {
  const recipe = createMotionPreset("apartment-morph");
  for (const key of recipe.motion!.stateKeys)
    key.room = { dimensions: [5.6, 2.8, 4.5] };
  recipe.motion!.intensity = 1;
  recipe.motion!.mappings = [
    {
      id: "bass-width",
      enabled: true,
      source: "low",
      property: "roomWidth",
      amount: 1,
    },
  ];
  return recipe;
}

describe("full-frame acoustic sampling evidence", () => {
  it("covers a full-length loop and retains an excursion beyond the old 241-frame limit", () => {
    const original = fixedRoom();
    const recipe = validateRecipe(
      reconcileDuration(original, { ...original, frames: TAKE_FRAMES.max }),
    );
    recipe.bandEnvelopes.low = Array.from(
      { length: recipe.frames },
      (_, frame) => (frame === 700 ? 1 : 0),
    );
    const schedule = buildAcousticSchedule(recipe);
    expect(validateAcousticSchedule(schedule)).toBe(schedule);
    expect(schedule.frames).toBe(721);
    expect(schedule.duration).toBe(721 / 24);
    expect(schedule.snapshots.at(-1)?.frame).toBe(720);
    expect(schedule.snapshots.some((snapshot) => snapshot.frame === 700)).toBe(
      true,
    );
    expect(schedule.snapshots.length).toBeLessThanOrEqual(24);
    expect(schedule.approximation!.comparedFrames).toBe(721);
    expect(schedule.approximation!.authoredFramesRetained).toBe(3);
    expect(() =>
      validateAcousticSchedule({
        ...schedule,
        frames: 729,
        duration: 729 / 24,
      }),
    ).toThrow(/schedule/);
  });

  it("renders the full-length picture duration and preserves finite PCM", async () => {
    const original = fixedRoom();
    const recipe = validateRecipe(
      reconcileDuration(original, { ...original, frames: TAKE_FRAMES.max }),
    );
    const schedule = buildAcousticSchedule(recipe, {
      static: true,
      maxIRSeconds: 0.1,
      sampleEveryFrames: 720,
    });
    const rate = 8000;
    const samples = new Float32Array(Math.round(schedule.duration * rate));
    const late = Math.round((700 * rate) / 24);
    samples[0] = 0.25;
    samples[late] = 0.25;
    const output = await renderDynamicRoomAudio(
      { channels: [samples], sampleRate: rate, envelope: [] },
      schedule,
      { wet: 0, dry: 1, tail: "trim-fade" },
    );
    expect(output.track.channels[0].length).toBe(Math.round((721 * rate) / 24));
    expect(output.track.channels[0][0]).toBe(0.25);
    expect(output.track.channels[0][late]).toBe(0.25);
    expect(output.track.channels[0].every(Number.isFinite)).toBe(true);
    expect(output.wav.size).toBe(44 + samples.length * 2);
    expect(() =>
      buildAcousticSchedule(recipe, { sampleEveryFrames: 721 }),
    ).toThrow(/sampling/);
  });

  it("cannot mistake pulses between uniform sample times for a static room", () => {
    const recipe = fixedRoom();
    recipe.bandEnvelopes.low = Array.from(
      { length: recipe.frames },
      (_, frame) => (frame % 12 === 6 ? 1 : 0),
    );
    const schedule = buildAcousticSchedule(recipe);
    expect(evaluateScene(recipe, 6).room!.dimensions[0]).toBe(6.6);
    expect(schedule.treatment).toBe("dynamic");
    expect(schedule.snapshots.length).toBeLessThanOrEqual(24);
    expect(schedule.snapshots.some((entry) => entry.frame % 12 === 6)).toBe(
      true,
    );
    expect(schedule.approximation).toMatchObject({
      method: "adaptive-room-inputs",
      comparedFrames: recipe.frames,
      toleranceMeters: 0.05,
      budgetLimited: true,
    });
    // Independently measure the largest coordinate deviation on the whole grid.
    let error = 0;
    for (let frame = 0; frame < recipe.frames; frame++) {
      const right = schedule.snapshots.findIndex(
        (entry) => entry.frame >= frame,
      );
      const to = schedule.snapshots[right],
        from = schedule.snapshots[Math.max(0, right - 1)],
        progress =
          to.frame === from.frame
            ? 0
            : (frame - from.frame) / (to.frame - from.frame);
      const predicted =
        from.room!.dimensions[0] +
        (to.room!.dimensions[0] - from.room!.dimensions[0]) * progress;
      error = Math.max(
        error,
        Math.abs(evaluateScene(recipe, frame).room!.dimensions[0] - predicted),
      );
    }
    expect(schedule.approximation!.maxErrorMeters).toBeCloseTo(error, 12);
  });

  it("retains uniform samples and adds a short isolated excursion within the budget", () => {
    const recipe = fixedRoom();
    recipe.bandEnvelopes.low = Array.from(
      { length: recipe.frames },
      (_, frame) => (frame === 6 ? 1 : 0),
    );
    const schedule = buildAcousticSchedule(recipe);
    const frames = schedule.snapshots.map((entry) => entry.frame);
    for (let frame = 0; frame < recipe.frames; frame += 12)
      expect(frames).toContain(frame);
    expect(frames).toContain(6);
    expect(schedule.approximation!.maxErrorMeters).toBeLessThanOrEqual(0.05);
    expect(schedule.approximation!.budgetLimited).toBe(false);
  });

  it("prioritises authored state times and reports insufficient sampling budgets", () => {
    const recipe = fixedRoom();
    recipe.motion!.stateKeys[1].frame = 23;
    recipe.motion!.stateKeys[1].room = { dimensions: [9, 4, 7] };
    const schedule = buildAcousticSchedule(recipe);
    expect(schedule.snapshots.map((s) => s.frame)).toContain(23);
    expect(schedule.approximation!.authoredFramesRetained).toBe(3);
    const limited = buildAcousticSchedule(recipe, { maxSnapshots: 2 });
    expect(limited.snapshots.map((s) => s.frame)).toEqual([0, 144]);
    expect(limited.approximation).toMatchObject({
      budgetLimited: true,
      authoredFramesRetained: 2,
      authoredFramesTotal: 3,
      largestErrorFrame: 23,
    });
  });

  it("distinguishes a verified static room from an explicitly frozen frame zero", () => {
    const recipe = fixedRoom();
    const staticRoom = buildAcousticSchedule(recipe);
    expect(staticRoom.treatment).toBe("static");
    expect(staticRoom.snapshots).toHaveLength(1);
    expect(staticRoom.approximation).toMatchObject({
      comparedFrames: 145,
      maxErrorMeters: 0,
    });
    recipe.bandEnvelopes.low = [0, 1];
    const frozen = buildAcousticSchedule(recipe, { static: true });
    expect(frozen.treatment).toBe("static");
    expect(frozen.approximation).toMatchObject({
      method: "frame-zero",
      comparedFrames: 1,
      maxErrorMeters: null,
    });
    expect(validateAcousticSchedule(frozen)).toEqual(frozen);
  });

  it("validates sampling evidence before rendering an imported schedule", () => {
    const schedule = buildAcousticSchedule(fixedRoom());
    schedule.approximation!.comparedFrames = 1;
    expect(() => validateAcousticSchedule(schedule)).toThrow(
      /sampling evidence/,
    );
    schedule.approximation!.comparedFrames = schedule.frames;
    schedule.approximation!.maxErrorMeters = Infinity;
    expect(() => validateAcousticSchedule(schedule)).toThrow(
      /sampling evidence/,
    );
  });
});

describe("finite room PCM safety", () => {
  const input = (value: number) => ({
    channels: [Float32Array.of(value)],
    sampleRate: 8000,
    envelope: [],
  });
  const schedule = () =>
    buildAcousticSchedule(fixedRoom(), { static: true, maxIRSeconds: 0.1 });
  it("rejects huge finite input before float32 mix overflow can produce NaNs", async () => {
    expect(Number.isFinite(input(3e38).channels[0][0])).toBe(true);
    await expect(
      renderDynamicRoomAudio(input(3e38), schedule(), { wet: 0, dry: 2 }),
    ).rejects.toThrow(/safety limit/);
    await expect(
      renderDynamicRoomAudio(input(-MAX_ROOM_PCM_AMPLITUDE * 2), schedule(), {
        wet: 0,
      }),
    ).rejects.toThrow(/safety limit/);
  });
  it("fails a non-finite accumulated wet mix before peak normalisation or export", async () => {
    await expect(
      renderDynamicRoomAudio(
        input(0.1),
        schedule(),
        { wet: 2, dry: 0 },
        async (_channels, _ir, _rate, length) => [
          new Float32Array(length).fill(3e38),
        ],
      ),
    ).rejects.toThrow(/finite safety limit/);
  });
  it("continues to accept ordinary unclipped float PCM and applies one whole-mix gain", async () => {
    const rendered = await renderDynamicRoomAudio(input(2), schedule(), {
      wet: 0,
      dry: 1,
      tail: "trim-fade",
    });
    expect(rendered.peakGain).toBeCloseTo(0.49);
    expect(rendered.track.channels[0][0]).toBeCloseTo(0.98);
    expect(rendered.track.channels[0].every(Number.isFinite)).toBe(true);
  });
});
