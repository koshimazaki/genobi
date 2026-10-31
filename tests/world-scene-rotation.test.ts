import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import {
  cameraAt,
  cameraTargetAt,
  validateRecipe,
} from "../src/world-builder/recipe";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { cameraOrbitPatch } from "../src/world-builder/SceneMotionShortcuts";

describe("independent object turns and camera orbits during a morph", () => {
  it.each(["x", "y", "z"] as const)(
    "rotates around %s without changing the morph endpoints or retained IDs",
    (axis) => {
      const base = createMotionPreset("fruit-morph");
      base.motion!.mappings = [];
      const rotated = validateRecipe({
        ...base,
        motion: { ...base.motion, rotation: { axis, turns: 1 } },
      });
      expect(evaluateScene(rotated, 0).objects).toEqual(
        evaluateScene(base, 0).objects,
      );
      expect(evaluateScene(rotated, 144).objects).toEqual(
        evaluateScene(base, 144).objects,
      );
      const middle = evaluateScene(rotated, 72).objects;
      const authored = evaluateScene(base, 72).objects;
      expect(middle.map((p) => p.id)).toEqual(authored.map((p) => p.id));
      const pivot = new Vector3(...base.motion!.pivot);
      middle.forEach((p, i) =>
        expect(new Vector3(p.x, p.y, p.z).distanceTo(pivot)).toBeCloseTo(
          new Vector3(authored[i].x, authored[i].y, authored[i].z).distanceTo(
            pivot,
          ),
          10,
        ),
      );
      expect(
        middle.some(
          (p, i) =>
            Math.abs(p.x - authored[i].x) +
              Math.abs(p.y - authored[i].y) +
              Math.abs(p.z - authored[i].z) >
            0.1,
        ),
      ).toBe(true);
      expect(evaluateScene(rotated, 72, { editing: true }).objects).toEqual(
        evaluateScene(base, 72, { editing: true }).objects,
      );
      const before = evaluateScene(rotated, 37.5);
      evaluateScene(rotated, 140);
      expect(evaluateScene(rotated, 37.5)).toEqual(before);
    },
  );

  it.each(["x", "y", "z"] as const)(
    "layers a full camera orbit around %s over the saved camera track",
    (axis) => {
      const base = createMotionPreset("city-to-loft");
      base.cameraMotion!.audio.enabled = false;
      const recipe = validateRecipe({
        ...base,
        ...cameraOrbitPatch(base, axis),
      });
      expect(cameraAt(recipe, 0)).toEqual(cameraAt(base, 0));
      expect(cameraAt(recipe, base.frames - 1)).toEqual(
        cameraAt(base, base.frames - 1),
      );
      expect(cameraAt(recipe, 72)).not.toEqual(cameraAt(base, 72));
      expect(cameraTargetAt(recipe, 72)).toEqual(cameraTargetAt(base, 72));
      const target = new Vector3(...cameraTargetAt(base, 72));
      expect(
        new Vector3(...cameraAt(recipe, 72)).distanceTo(target),
      ).toBeCloseTo(new Vector3(...cameraAt(base, 72)).distanceTo(target), 12);
      expect(evaluateScene(recipe, 72).objects).toEqual(
        evaluateScene(base, 72).objects,
      );
      const next = validateRecipe({
        ...recipe,
        ...cameraOrbitPatch(recipe, "none"),
      });
      expect(cameraAt(next, 72)).toEqual(cameraAt(base, 72));
    },
  );

  it("starts an orbit from the current legacy shot instead of reviving a disabled saved path", () => {
    const base = createMotionPreset("city-to-loft");
    base.cameraMotion!.enabled = false;
    base.azimuth = 45;
    base.radius = 30;
    const pose = cameraAt(base, 24);
    const orbit = validateRecipe({
      ...base,
      ...cameraOrbitPatch(base, "y", 24),
    });
    expect(cameraAt(orbit, 0)).toEqual(pose);
  });

  it("rejects unknown axes, nonfinite turns and excessive rotation", () => {
    const base = createMotionPreset("city-to-loft");
    for (const rotation of [
      { axis: "w", turns: 1 },
      { axis: "y", turns: NaN },
      { axis: "x", turns: 3 },
      { axis: ["x"], turns: 1 },
    ]) {
      expect(() =>
        validateRecipe({ ...base, motion: { ...base.motion, rotation } }),
      ).toThrow(/rotation/);
      expect(() =>
        validateRecipe({
          ...base,
          cameraMotion: { ...base.cameraMotion, orbit: rotation },
        }),
      ).toThrow(/rotation/);
    }
  });
});
