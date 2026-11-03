import { describe, expect, it } from "vitest";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import type { AudioTrack } from "../src/world-builder/audio";
import {
  bakeCues,
  createStudy,
  selectCues,
  type Cue,
  type Study,
} from "../scripts/experiments/recipes";
import {
  assertAudioExcerpt,
  assertGuideBounds,
  serializeRecipe,
} from "../scripts/experiments/contracts";

const dimensions = (frames = 193) => ({ width: 768, height: 448, frames });
const analysis = (frames: number, value?: number) => {
  const data = Array.from(
    { length: frames },
    (_, i) => value ?? 0.1 + ((i * 13) % 811) / 1000,
  );
  return {
    envelope: [...data],
    bandEnvelopes: {
      sub: [...data],
      low: [...data],
      mid: [...data],
      high: [...data],
    },
  };
};
const cue = (frame: number, transitionFrames = 6): Cue => ({
  frame,
  transitionFrames,
  source: "authored",
  method: "authored-frame",
});

describe("pilot cue timing and bounds", () => {
  it("labels band changes as candidates and silence as authored fallback", () => {
    const r = createMotionPreset("fruit-morph-fine");
    r.frames = 193;
    Object.assign(r, analysis(r.frames, 0));
    expect(selectCues(r)).toEqual([cue(60), cue(134)]);
    r.bandEnvelopes.low[48] = 0.9;
    r.bandEnvelopes.high[128] = 0.8;
    // Peaks outside each search window do not move the ordered cue pair.
    r.bandEnvelopes.low[10] = 1;
    r.bandEnvelopes.high[185] = 1;
    expect(selectCues(r)).toEqual([
      { ...cue(48), source: "low", method: "positive-band-change" },
      { ...cue(128), source: "high", method: "positive-band-change" },
    ]);
  });

  it.each(["fruit", "architecture"] as const)(
    "%s holds A, arrives at B and C, then holds the final form",
    (study) => {
      const { recipe, metadata } = createStudy(
        study,
        analysis(193, 0),
        dimensions(),
        [cue(48), cue(128)],
      );
      const keys = recipe.motion!.stateKeys;
      expect(keys.map((key) => key.frame)).toEqual([0, 48, 54, 128, 134]);
      expect(
        metadata.cues.map(({ frame, arrivalFrame }) => [frame, arrivalFrame]),
      ).toEqual([
        [48, 54],
        [128, 134],
      ]);
      expect(metadata.cues.map(({ target }) => target)).toEqual(
        study === "fruit" ? ["Apple", "Papaya"] : ["Towers", "Diamond"],
      );
      const ids = Object.keys(keys[0].objects).sort();
      for (const key of keys) {
        expect(Object.keys(key.objects).sort()).toEqual(ids);
        const evaluated = evaluateScene(recipe, key.frame, { editing: true });
        for (const part of evaluated.objects) {
          const target = key.objects[part.id];
          if (target)
            for (const field of ["x", "y", "z", "scale"] as const)
              expect(part[field]).toBeCloseTo(target[field], 9);
        }
      }
      const objects = (frame: number) =>
        evaluateScene(recipe, frame, { editing: true }).objects;
      expect(objects(0)).toEqual(objects(48));
      expect(objects(54)).toEqual(objects(128));
      expect(objects(134)).toEqual(objects(192));
      expect(objects(51)).not.toEqual(objects(48));
      expect(objects(51)).not.toEqual(objects(54));
    },
  );

  it("rejects overlapping, reversed, fractional and out-of-range cue windows", () => {
    const states = createMotionPreset("fruit-morph-fine").motion!.stateKeys;
    for (const cues of [
      [cue(0), cue(128)],
      [cue(48), cue(54)],
      [cue(128), cue(48)],
      [cue(48.5), cue(128)],
      [cue(48, 0), cue(128)],
      [cue(48, 1.5), cue(128)],
      [cue(48), cue(187)],
      [cue(48)],
    ])
      expect(() => bakeCues(states, cues, 193)).toThrow(/ordered cues/);
    expect(bakeCues(states, [cue(48), cue(186)], 193).at(-1)!.frame).toBe(192);
  });

  it.each([97, 193])(
    "all four %i-frame recipes fit the actual UTF-8 boundary with measured-shaped envelopes",
    (frames) => {
      for (const study of [
        "fruit",
        "architecture",
        "falling",
        "room",
      ] as Study[]) {
        const { recipe } = createStudy(
          study,
          analysis(frames),
          dimensions(frames),
        );
        const serialized = serializeRecipe(recipe);
        expect(serialized.bytes).toBe(
          Buffer.byteLength(serialized.text, "utf8"),
        );
        expect(serialized.bytes).toBeLessThanOrEqual(64_000);
        expect(JSON.parse(serialized.text)).toEqual(recipe);
        expect(serialized.text).not.toContain("\n");
        expect(recipe.frames).toBe(frames);
        expect(recipe.fps).toBe(24);
        expect(recipe.seconds).toBeNull();
        expect(recipe.loop).toBe(false);
      }
    },
  );

  it("rejects a UTF-8 overflow even when the character count would pass", () => {
    const { recipe } = createStudy("fruit", analysis(193), dimensions());
    recipe.prompt = "果".repeat(500);
    expect(JSON.stringify(recipe).length).toBeLessThan(64_000);
    expect(() => serializeRecipe(recipe)).toThrow(/UTF-8 bytes/);
  });

  it("rejects unsupported frames, excessive decoder memory and mismatched analysis before capture", () => {
    expect(() => assertGuideBounds(dimensions(192))).toThrow(/97\/193/);
    expect(() =>
      assertGuideBounds({ ...dimensions(), width: 1920, height: 1920 }),
    ).toThrow(/2 GiB/);
    expect(() => assertGuideBounds({ ...dimensions(), width: 769 })).toThrow(
      /divisible by 64/,
    );
    expect(() => createStudy("fruit", analysis(97), dimensions())).toThrow(
      /exact pilot frame count/,
    );
    expect(() => assertGuideBounds(dimensions())).not.toThrow();
  });

  it.each([97, 193])(
    "keeps the %i-frame falling interior proxy bounded throughout the journey",
    (frames) => {
      const { recipe, metadata } = createStudy(
        "falling",
        analysis(frames, 1),
        dimensions(frames),
      );
      expect(metadata.indoorFromFrame).toBe((frames - 1) / 2);
      expect(metadata.acousticMeaning).toMatch(/outdoor soundtrack stays dry/);
      for (let frame = 0; frame < frames; frame++) {
        const room = evaluateScene(recipe, frame).room!;
        for (const n of room.dimensions) {
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(32);
        }
        for (const point of [room.source, room.listener]) {
          expect(Math.abs(point[0])).toBeLessThanOrEqual(
            room.dimensions[0] / 2 - 0.05,
          );
          expect(point[1]).toBeGreaterThanOrEqual(0.05);
          expect(point[1]).toBeLessThanOrEqual(room.dimensions[1] - 0.05);
          expect(Math.abs(point[2])).toBeLessThanOrEqual(
            room.dimensions[2] / 2 - 0.05,
          );
        }
        const camera = sceneCameraAt(recipe, frame)!;
        for (const n of [...camera.position, ...camera.target]) {
          expect(Number.isFinite(n)).toBe(true);
          expect(Math.abs(n)).toBeLessThanOrEqual(80);
        }
      }
      recipe.cameraMotion!.audio.enabled = false;
      for (const key of recipe.cameraMotion!.keys.slice(1))
        expect(sceneCameraAt(recipe, key.frame)!.position).toEqual(
          evaluateScene(recipe, key.frame, { audio: false }).room!.listener,
        );
    },
  );
});

describe("pilot source audio contract", () => {
  const track = (frames: number): AudioTrack => {
    const data = analysis(frames);
    return {
      sampleRate: 48000,
      channels: [new Float32Array(frames * 2000)],
      envelope: data.envelope,
      bands: data.bandEnvelopes,
    };
  };
  it.each([97, 193])(
    "accepts the exact %i-frame PCM excerpt without changing timing",
    (frames) => {
      expect(() => assertAudioExcerpt(track(frames), frames)).not.toThrow();
    },
  );
  it("rejects short or long audio, resampling, channel mismatch and incomplete analysis", () => {
    for (const change of [
      (t: AudioTrack) => {
        t.channels[0] = new Float32Array(386000 - 1);
      },
      (t: AudioTrack) => {
        t.channels[0] = new Float32Array(386000 + 1);
      },
      (t: AudioTrack) => {
        t.sampleRate = 44100;
      },
      (t: AudioTrack) => {
        t.channels.push(new Float32Array(10));
      },
      (t: AudioTrack) => {
        t.envelope.pop();
      },
      (t: AudioTrack) => {
        t.bands!.high.pop();
      },
    ]) {
      const input = track(193);
      change(input);
      expect(() => assertAudioExcerpt(input, 193)).toThrow(/exact|48000/);
    }
  });
});
