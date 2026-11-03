import { describe, expect, it } from "vitest";
import { defaultRecipe, validateRecipe } from "../src/world-builder/recipe";
import {
  fruitBranchPresetPatch,
  FRUIT_BRANCH_STATES,
} from "../src/world-builder/motion-fruit-branch-preset";
import { evaluateScene } from "../src/world-builder/evaluate-scene";

function fruit() {
  return validateRecipe({
    ...structuredClone(defaultRecipe),
    objects: [],
    audioRoutes: [],
    avatar: false,
    screen: false,
    ...fruitBranchPresetPatch(),
  });
}

describe("five-state fruit routing demonstration", () => {
  it("retains 96 editable identities and all five named shapes within the existing byte budget", () => {
    const recipe = fruit(),
      motion = recipe.motion!;
    expect(motion.instances!.count).toBe(96);
    expect(motion.stateKeys.map((key) => key.id)).toEqual(
      FRUIT_BRANCH_STATES.map((fruit) => `fruit-${fruit}`),
    );
    expect(motion.morphControl!.enabled).toBe(false);
    expect(recipe.stageLook).toBe("dark-grid");
    const ids = Object.keys(motion.stateKeys[0].objects);
    for (const key of motion.stateKeys)
      expect(Object.keys(key.objects)).toEqual(ids);
    const samples = Array.from({ length: 241 }, (_, index) =>
      Math.abs(Math.sin(index * 0.123456789)),
    );
    const withAudio = {
      ...recipe,
      envelope: samples,
      bandEnvelopes: {
        sub: samples,
        low: samples,
        mid: samples,
        high: samples,
      },
    };
    expect(JSON.stringify(withAudio).length).toBeLessThan(64_000);
    expect(validateRecipe(JSON.parse(JSON.stringify(withAudio)))).toEqual(
      withAudio,
    );
    const other = fruit();
    motion.morphControl!.target.routes[0].amount = 0;
    expect(other.motion!.morphControl!.target.routes[0].amount).toBe(1);
  });

  it("routes bass to apple, mids to orange and highs to watermelon independently of progress", () => {
    const recipe = fruit(),
      control = recipe.motion!.morphControl!;
    control.enabled = true;
    control.progress.position = 0.65;
    control.progress.amount = 0;
    for (const [source, target] of [
      ["low", "apple"],
      ["mid", "orange"],
      ["high", "watermelon"],
    ] as const) {
      recipe.bandEnvelopes = { low: [], mid: [], high: [], [source]: [1] };
      const snapshot = evaluateScene(recipe, 0);
      expect(snapshot.morphControl!.progress).toBe(0.65);
      expect(snapshot.morphControl!.dominantStateId).toBe(`fruit-${target}`);
      expect(
        snapshot.morphControl!.weights.find(
          ({ stateId }) => stateId === `fruit-${target}`,
        )!.weight,
      ).toBe(1);
    }
    recipe.bandEnvelopes = { low: [], mid: [], high: [] };
    expect(evaluateScene(recipe, 0).morphControl!.dominantStateId).toBe(
      "fruit-papaya",
    );
  });
});
