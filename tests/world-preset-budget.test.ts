import { describe, expect, it } from "vitest";
import {
  createMotionPreset,
  MOTION_PRESETS,
} from "../src/world-builder/motion-presets";
import {
  cameraAt,
  cameraFovAt,
  cameraTargetAt,
  validateRecipe,
} from "../src/world-builder/recipe";
import { reconcileDuration } from "../src/world-builder/take-duration";
import { compactLayouts } from "../src/world-builder/motion-layout-utils";
import { mixSceneTransform } from "../src/world-builder/scene-transform";
import { validTransform } from "../src/world-builder/scene-contract";
import type {
  SceneTransform,
  SceneVector,
} from "../src/world-builder/scene-state";

const size = (part: SceneTransform) =>
  ["scaleX", "scaleY", "scaleZ"].map(
    (axis) => part.scale * (part[axis as "scaleX" | "scaleY" | "scaleZ"] ?? 1),
  );

describe("authored layout compaction", () => {
  it("omits optional neutral fields and preserves key and interpolated dimensions", () => {
    const input: SceneTransform[][] = [0.54, 0.63, 0.54].map((width, index) => [
      {
        x: index,
        y: 2,
        z: 0,
        scale: 1,
        scaleX: width,
        scaleY: 0.12,
        scaleZ: 0.32,
        rotation: 0,
        rotationX: 0.2,
        rotationZ: 0,
      },
      {
        x: 0,
        y: 0,
        z: 0,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotation: 0,
        rotationX: 0,
        rotationZ: 0,
      },
    ]);
    const before = structuredClone(input);
    const result = compactLayouts(input);
    expect(input).toEqual(before);
    expect(JSON.stringify(result).length).toBeLessThan(
      JSON.stringify(input).length,
    );
    result.forEach((layout, state) => {
      expect(layout[1]).toEqual({ x: 0, y: 0, z: 0, scale: 1 });
      expect(size(layout[0])).toEqual(size(input[state][0]));
      expect(layout[0].rotationX).toBe(0.2);
      expect(validTransform(layout[0])).toBe(true);
    });
    for (const t of [0.1, 0.37, 0.5, 0.81]) {
      const expected = size(mixSceneTransform(input[0][0], input[1][0], t));
      const actual = size(mixSceneTransform(result[0][0], result[1][0], t));
      actual.forEach((value, axis) =>
        expect(value).toBeCloseTo(expected[axis], 14),
      );
    }
  });

  it("keeps a factor from crossing scalar or per-axis transform limits", () => {
    const input = [
      [{ x: 0, y: 1, z: 0, scale: 0.1, scaleX: 8, scaleY: 0.1, scaleZ: 0.1 }],
    ];
    const result = compactLayouts(input)[0][0];
    expect(result.scale).toBeGreaterThanOrEqual(0.1);
    expect(validTransform(result)).toBe(true);
    expect(size(result)).toEqual(size(input[0][0]));
  });
});

describe("full-length audio and camera recipe budget", () => {
  for (const { id } of MOTION_PRESETS)
    it(`${id} fits 241 full-precision audio samples per band and three camera keys`, () => {
      const base = createMotionPreset(id);
      const recipe = validateRecipe(
        reconcileDuration(base, { ...base, seconds: 241 / 24 }),
      );
      const signal = Array.from({ length: 241 }, (_, i) =>
        Math.abs(Math.sin(i + 0.1283)),
      );
      recipe.envelope = [...signal];
      recipe.bandEnvelopes = {
        sub: [...signal],
        low: [...signal],
        mid: [...signal],
        high: [...signal],
      };
      const keys = [0, 120, 240].map((frame, index) => {
        const position = cameraAt(recipe, frame);
        return {
          id: `camera-budget-${index}`,
          frame,
          position: [
            position[0] + index * 0.02,
            position[1],
            position[2] - index * 0.1,
          ] as SceneVector,
          target: [...cameraTargetAt(recipe, frame)] as SceneVector,
          fov: cameraFovAt(recipe, frame),
          easing: "easeInOut" as const,
        };
      });
      recipe.cameraMotion = {
        version: 1,
        enabled: true,
        keys,
        audio: { enabled: true, source: "sub", amount: 0.2, motion: "push" },
      };
      expect(
        new TextEncoder().encode(JSON.stringify(recipe)).length,
      ).toBeLessThan(64_000);
      const checked = validateRecipe(recipe);
      expect(checked.frames).toBe(241);
      expect(checked.cameraMotion?.keys).toHaveLength(3);
      expect(checked.envelope).toEqual(signal);
      for (const data of Object.values(checked.bandEnvelopes))
        expect(data).toEqual(signal);
    });
});
