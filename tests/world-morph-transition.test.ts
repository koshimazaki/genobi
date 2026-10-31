import { describe, expect, it } from "vitest";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { validateRecipe } from "../src/world-builder/recipe";
import { defaultMorphControl } from "../src/world-builder/scene-morph-control";
import { transitionTransform } from "../src/world-builder/scene-transition";
import { mixSceneTransform } from "../src/world-builder/scene-transform";
import { motionRecipe } from "./scene-motion-fixture";

describe("deterministic retained-part transition paths", () => {
  it.each(["direct", "scatter", "twist", "assemble"] as const)(
    "keeps %s endpoints exact in authored and routed morphs",
    (style) => {
      const recipe = motionRecipe(3, 4),
        motion = recipe.motion!;
      const authored = motion.stateKeys.map((key) =>
        evaluateScene(recipe, key.frame),
      );
      motion.transitionStyle = style;
      for (const [index, key] of motion.stateKeys.entries())
        expect(evaluateScene(recipe, key.frame)).toEqual(authored[index]);
      motion.morphControl = defaultMorphControl(motion);
      motion.morphControl.enabled = true;
      motion.morphControl.progress.amount = 0;
      for (const progress of [0, 1]) {
        motion.morphControl.progress.position = progress;
        const result = evaluateScene(recipe, 24);
        expect(result.objects).toEqual(authored[progress].objects);
        expect(result.room).toEqual(authored[progress].room);
      }
    },
  );

  it.each(["scatter", "twist", "assemble"] as const)(
    "repeats %s paths exactly after backwards, fractional and random seeks",
    (style) => {
      const recipe = motionRecipe(3, 4),
        motion = recipe.motion!;
      const direct = evaluateScene(recipe, 24);
      motion.transitionStyle = style;
      const frozen = structuredClone(recipe),
        middle = evaluateScene(recipe, 24);
      expect(middle.objects).not.toEqual(direct.objects);
      for (const frame of [96, 0, 72, 2.125, 45.75, 24, 95.9])
        evaluateScene(recipe, frame);
      expect(evaluateScene(recipe, 24)).toEqual(middle);
      expect(recipe).toEqual(frozen);
      expect(
        middle.objects.every((part) =>
          [part.x, part.y, part.z, part.scale].every(Number.isFinite),
        ),
      ).toBe(true);
      expect(middle.objects.map((part) => part.id)).toEqual(
        direct.objects.map((part) => part.id),
      );
    },
  );

  it("keeps the default direct path exactly compatible and bounds scatter excursion", () => {
    const motion = motionRecipe(2, 1).motion!;
    const from = { x: 39, y: 39, z: 39, scale: 1 },
      to = { ...from, x: 40 };
    expect(transitionTransform(from, to, 0.5, "part", motion)).toEqual(
      mixSceneTransform(from, to, 0.5),
    );
    motion.transitionStyle = "scatter";
    const scattered = transitionTransform(from, to, 0.5, "part", motion);
    expect(
      [scattered.x, scattered.y, scattered.z].every(
        (value) => value >= -40 && value <= 40,
      ),
    ).toBe(true);
    expect(scattered).not.toEqual(
      transitionTransform(from, to, 0.5, "other-part", motion),
    );
    const invalid = motionRecipe();
    invalid.motion!.transitionStyle = "script" as "direct";
    expect(() => validateRecipe(invalid)).toThrow(/transition style/);
  });
});
