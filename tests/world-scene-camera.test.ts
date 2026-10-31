import { describe, expect, it } from "vitest";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import {
  cameraAt,
  cameraTargetAt,
  cameraFovAt,
  validateRecipe,
} from "../src/world-builder/recipe";
import {
  sceneCameraAt,
  reverseSceneTravel,
} from "../src/world-builder/scene-camera";
import { reconcileDuration } from "../src/world-builder/take-duration";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { projectSceneGeometry } from "../src/world-builder/scene-projection";

describe("scene travel camera", () => {
  it("lands on authored positions, look targets and lenses on direct and reverse seeks", () => {
    const r = createMotionPreset("city-to-loft");
    const before = structuredClone(r);
    for (const key of r.cameraMotion!.keys) {
      expect(cameraAt(r, key.frame)).toEqual(key.position);
      expect(cameraTargetAt(r, key.frame)).toEqual(key.target);
      expect(cameraFovAt(r, key.frame)).toBe(key.fov);
    }
    const frames = [0, 1, 48, 96, 143, 192];
    const samples = frames.map((frame) => sceneCameraAt(r, frame));
    for (let i = frames.length - 1; i >= 0; i--)
      expect(sceneCameraAt(r, frames[i])).toEqual(samples[i]);
    expect(r).toEqual(before);
    expect(sceneCameraAt(r, -10)).toEqual(samples[0]);
    expect(sceneCameraAt(r, 300)).toEqual(samples.at(-1));
  });
  it("keeps zero and missing sub neutral and bounds a prepared sub push", () => {
    const r = createMotionPreset("city-to-loft");
    const neutral = sceneCameraAt(r, 96)!;
    r.cameraMotion!.audio = { enabled: true, source: "sub", amount: 1 };
    r.bandEnvelopes.low = Array(r.frames).fill(1);
    delete r.bandEnvelopes.sub;
    expect(sceneCameraAt(r, 96)).toEqual(neutral);
    r.bandEnvelopes.sub = Array(r.frames).fill(1);
    const pushed = sceneCameraAt(r, 96)!;
    expect(
      Math.hypot(...pushed.position.map((v, i) => v - neutral.position[i])),
    ).toBeCloseTo(1);
    expect(pushed.target).toEqual(neutral.target);
    expect(pushed.fov).toEqual(neutral.fov);
    r.cameraMotion!.audio.amount = 0;
    expect(sceneCameraAt(r, 96)).toEqual(neutral);
    r.cameraMotion!.audio = {
      enabled: true,
      source: "sub",
      amount: 0.4,
      motion: "lift",
    };
    expect(sceneCameraAt(r, 96)!.position[1]).toBeCloseTo(
      neutral.position[1] + 0.4,
    );
    expect(projectSceneGeometry(r, 96, 400, 220, false)).toEqual(
      projectSceneGeometry(
        createMotionPreset("city-to-loft"),
        96,
        400,
        220,
        false,
      ),
    );
  });
  it("retimes both tracks together and reverses the complete scene journey", () => {
    const r = createMotionPreset("city-to-loft");
    const shorter = validateRecipe(reconcileDuration(r, { ...r, seconds: 4 }));
    expect(shorter.frames).toBe(97);
    expect(shorter.motion!.stateKeys.map((k) => k.frame)).toEqual([0, 48, 96]);
    expect(shorter.cameraMotion!.keys.map((k) => k.frame)).toEqual([0, 48, 96]);
    const reversed = validateRecipe({ ...r, ...reverseSceneTravel(r) });
    for (const frame of [0, 48, 96, 144, 192]) {
      const a = sceneCameraAt(reversed, frame)!;
      const b = sceneCameraAt(r, r.frames - 1 - frame)!;
      a.position.forEach((v, i) => expect(v).toBeCloseTo(b.position[i]));
      const actual = evaluateScene(reversed, frame).objects;
      const expected = evaluateScene(r, r.frames - 1 - frame).objects;
      actual.forEach((object, i) =>
        Object.entries(object).forEach(([name, value]) => {
          const other = expected[i][name as keyof typeof object];
          if (typeof value === "number")
            expect(value).toBeCloseTo(other as number, 10);
          else expect(value).toEqual(other);
        }),
      );
    }
    expect(reverseSceneTravel(reversed)).toEqual({
      motion: r.motion,
      cameraMotion: r.cameraMotion,
    });
  });
  it("validates imported paths rather than repairing malformed key data", () => {
    const r = createMotionPreset("city-to-loft");
    const invalid = (change: (v: typeof r) => void) => {
      const v = structuredClone(r);
      change(v);
      expect(() => validateRecipe(v)).toThrow();
    };
    invalid((v) => {
      v.cameraMotion!.keys[1].frame = 0;
    });
    invalid((v) => {
      v.cameraMotion!.keys[0].frame = 1;
    });
    invalid((v) => {
      v.cameraMotion!.keys[0].fov = 180;
    });
    invalid((v) => {
      v.cameraMotion!.keys[0].position = [NaN, 0, 0];
    });
    invalid((v) => {
      v.cameraMotion!.keys[0].position = [...v.cameraMotion!.keys[0].target];
    });
    invalid((v) => {
      v.cameraMotion!.audio.amount = 1.5;
    });
    r.cameraMotion!.keys.at(-1)!.frame--;
    expect(() => reverseSceneTravel(r)).toThrow(/final scene and camera keys/);
  });
  it("wraps keyed travel explicitly and leaves legacy shots unchanged when disabled", () => {
    const r = createMotionPreset("neo-tokyo-to-loft");
    r.loop = true;
    expect(sceneCameraAt(r, r.frames)).toEqual(sceneCameraAt(r, 0));
    r.cameraMotion!.enabled = false;
    const legacy = structuredClone(r);
    delete legacy.cameraMotion;
    expect(sceneCameraAt(r, 50)).toBeUndefined();
    expect(cameraAt(r, 50)).toEqual(cameraAt(legacy, 50));
    expect(cameraTargetAt(r, 50)).toEqual(cameraTargetAt(legacy, 50));
    expect(cameraFovAt(r, 50)).toBe(r.fov);
  });
});
