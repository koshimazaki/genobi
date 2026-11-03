import { describe, expect, it } from "vitest";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { validateRecipe } from "../src/world-builder/recipe";
import {
  defaultMorphControl,
  pruneMorphControl,
  type SceneMorphControl,
} from "../src/world-builder/scene-morph-control";
import { motionRecipe } from "./scene-motion-fixture";

function routed() {
  const recipe = motionRecipe(4, 4);
  recipe.motion!.morphControl = defaultMorphControl(recipe.motion!);
  recipe.motion!.morphControl.enabled = true;
  recipe.motion!.morphControl.progress.position = 1;
  recipe.motion!.morphControl.progress.amount = 0;
  return validateRecipe(recipe);
}

describe("independent morph progress and target axes", () => {
  it("reaches each authored endpoint while preserving every part ID", () => {
    const recipe = routed(),
      control = recipe.motion!.morphControl!;
    const ids = Object.keys(recipe.motion!.stateKeys[0].objects);
    for (const [index, source] of ["low", "mid", "high"].entries()) {
      recipe.bandEnvelopes = { low: [], mid: [], high: [], [source]: [1] };
      const snapshot = evaluateScene(recipe, 0);
      const target = evaluateScene(
        recipe,
        recipe.motion!.stateKeys[index + 1].frame,
        { editing: true },
      );
      expect(snapshot.morphControl!.progress).toBe(1);
      expect(snapshot.morphControl!.dominantStateId).toBe(`state-${index + 1}`);
      for (const id of ids) {
        const actual = snapshot.objects.find((p) => p.id === id)!;
        const expected = target.objects.find((p) => p.id === id)!;
        for (const property of ["x", "y", "z", "scale"] as const)
          expect(actual[property]).toBeCloseTo(expected[property], 12);
      }
      expect(snapshot.room).toEqual(target.room);
    }
    control.progress.position = 0;
    const origin = evaluateScene(recipe, 0);
    control.enabled = false;
    expect(origin.objects).toEqual(evaluateScene(recipe, 0).objects);
    expect(origin.morphControl!.progress).toBe(0);
  });

  it("lets loudness change progress independently of the frequency-selected destination", () => {
    const recipe = routed(),
      control = recipe.motion!.morphControl!;
    control.progress.position = 0;
    control.progress.amount = 1;
    recipe.envelope = [0.4];
    recipe.bandEnvelopes.low = [1];
    const bass = evaluateScene(recipe, 0);
    recipe.bandEnvelopes = { low: [], mid: [1], high: [] };
    const mids = evaluateScene(recipe, 0);
    expect(bass.morphControl!.progress).toBe(0.4);
    expect(mids.morphControl!.progress).toBe(0.4);
    expect(bass.morphControl!.dominantStateId).toBe("state-1");
    expect(mids.morphControl!.dominantStateId).toBe("state-2");
    expect(mids.objects[0].x).not.toBe(bass.objects[0].x);
    recipe.envelope = [0.8];
    const louder = evaluateScene(recipe, 0);
    expect(louder.morphControl!.progress).toBe(0.8);
    expect(louder.morphControl!.weights).toEqual(mids.morphControl!.weights);
  });

  it("blends simultaneous bands, controls and room state with normalized weights", () => {
    const recipe = routed();
    recipe.motion!.stateKeys[1].controls = { lift: 1 };
    recipe.motion!.stateKeys[2].controls = { lift: 3 };
    recipe.bandEnvelopes = { low: [0.5], mid: [0.5], high: [] };
    const snapshot = evaluateScene(recipe, 0);
    expect(snapshot.morphControl!.weights.map((w) => w.weight)).toEqual([
      0.5, 0.5, 0,
    ]);
    expect(snapshot.morphControl!.targetPosition).toBe(0.25);
    expect(snapshot.controls.lift).toBe(2);
    expect(snapshot.room!.dimensions).toEqual([7, 4.5, 5.5]);
    const a = recipe.motion!.stateKeys[1].objects["voxel-000"];
    const b = recipe.motion!.stateKeys[2].objects["voxel-000"];
    expect(snapshot.objects[0].x).toBeCloseTo((a.x + b.x) / 2, 12);
    expect(snapshot.objects[0].y).toBeCloseTo((a.y + b.y) / 2 + 2, 12);
  });

  it("uses manual target stops during silence and a deterministic strongest-band tie", () => {
    const recipe = routed(),
      control = recipe.motion!.morphControl!;
    control.target.position = 0.25;
    const manual = evaluateScene(recipe, 0);
    expect(manual.morphControl!.weights.map((w) => w.weight)).toEqual([
      0.5, 0.5, 0,
    ]);
    control.target.mode = "strongest";
    recipe.bandEnvelopes = { low: [1], mid: [1], high: [1] };
    const tied = evaluateScene(recipe, 0);
    expect(tied.morphControl!.weights.map((w) => w.weight)).toEqual([1, 0, 0]);
    control.target.routes[0].enabled = false;
    expect(evaluateScene(recipe, 0).morphControl!.dominantStateId).toBe(
      "state-2",
    );
  });

  it("makes zero intensity, zero amounts and missing bands exactly neutral to the chosen axes", () => {
    const recipe = routed(),
      control = recipe.motion!.morphControl!;
    control.progress.position = 0.3;
    control.target.position = 0.75;
    control.progress.amount = 2;
    recipe.envelope = [1];
    recipe.bandEnvelopes = { low: [1], mid: [1], high: [1] };
    const baseline = evaluateScene(recipe, 0, { audio: false });
    recipe.motion!.intensity = 0;
    expect(evaluateScene(recipe, 0)).toEqual(baseline);
    recipe.motion!.intensity = 1;
    control.progress.amount = 0;
    control.target.amount = 0;
    expect(evaluateScene(recipe, 0)).toEqual(baseline);
    control.progress.source = "sub";
    control.progress.amount = 2;
    control.target.amount = 1;
    control.target.routes.forEach((route) => {
      route.source = "sub";
    });
    expect(evaluateScene(recipe, 0)).toEqual(baseline);
  });

  it("interpolates exact fractional-frame signals and is independent of playback history", () => {
    const recipe = routed(),
      control = recipe.motion!.morphControl!;
    control.progress.position = 0;
    control.progress.amount = 1;
    recipe.envelope = [0, 1];
    recipe.bandEnvelopes = { low: [1, 0], mid: [0, 1], high: [] };
    const frozen = structuredClone(recipe);
    const half = evaluateScene(recipe, 0.5);
    expect(half.morphControl!.progress).toBe(0.5);
    expect(half.morphControl!.weights.map((w) => w.weight)).toEqual([
      0.5, 0.5, 0,
    ]);
    for (const frame of [96, 12.25, 0, 1, 0.5, 48])
      evaluateScene(recipe, frame);
    expect(evaluateScene(recipe, 0.5)).toEqual(half);
    expect(recipe).toEqual(frozen);
    control.progress.mode = "timeline";
    control.progress.amount = 0;
    expect(evaluateScene(recipe, 48).morphControl!.progress).toBe(0.5);
  });

  it("retains old scenes exactly when absent/disabled, and bypasses routing while editing", () => {
    const recipe = motionRecipe(4, 4);
    const existing = evaluateScene(recipe, 37.5);
    recipe.motion!.morphControl = defaultMorphControl(recipe.motion!);
    expect(evaluateScene(recipe, 37.5)).toEqual(existing);
    recipe.motion!.morphControl.enabled = true;
    const edited = evaluateScene(recipe, 37.5, { editing: true });
    delete recipe.motion!.morphControl;
    expect(edited).toEqual(evaluateScene(recipe, 37.5, { editing: true }));
    expect(validateRecipe(JSON.parse(JSON.stringify(recipe)))).toEqual(recipe);
  });
});

describe("bounded reference-only morph routing", () => {
  it.each([
    (c: SceneMorphControl) => {
      c.version = 2 as 1;
    },
    (c: SceneMorphControl) => {
      c.progress.position = Infinity;
    },
    (c: SceneMorphControl) => {
      c.progress.amount = 2.01;
    },
    (c: SceneMorphControl) => {
      c.progress.mode = ["manual"] as unknown as "manual";
    },
    (c: SceneMorphControl) => {
      c.target.position = -0.1;
    },
    (c: SceneMorphControl) => {
      c.target.amount = 1.01;
    },
    (c: SceneMorphControl) => {
      c.target.mode = "code" as "blend";
    },
    (c: SceneMorphControl) => {
      c.target.routes = [];
    },
    (c: SceneMorphControl) => {
      c.target.routes.push({ ...c.target.routes[0] });
    },
    (c: SceneMorphControl) => {
      c.target.routes[0].stateId = c.originStateId;
    },
    (c: SceneMorphControl) => {
      c.target.routes[0].source = "drum" as "low";
    },
    (c: SceneMorphControl) => {
      c.target.routes[0].amount = -1;
    },
    (c: SceneMorphControl) => {
      c.originStateId = "missing";
    },
    (c: SceneMorphControl) => {
      Object.assign(c.target, { expression: "arbitrary code" });
    },
  ])("rejects invalid controller input %#", (mutate) => {
    const recipe = routed();
    mutate(recipe.motion!.morphControl!);
    expect(() => validateRecipe(recipe)).toThrow(/morph routing/);
  });

  it("prunes removed targets and discards an unreferenced origin safely", () => {
    const motion = routed().motion!;
    const nextKeys = motion.stateKeys.filter((key) => key.id !== "state-2");
    const pruned = pruneMorphControl(motion, nextKeys)!;
    expect(pruned.target.routes.map((route) => route.stateId)).toEqual([
      "state-1",
      "state-3",
    ]);
    expect(motion.morphControl!.target.routes).toHaveLength(3);
    expect(
      pruneMorphControl(motion, motion.stateKeys.slice(1)),
    ).toBeUndefined();
    expect(
      pruneMorphControl(motion, motion.stateKeys.slice(0, 1)),
    ).toBeUndefined();
  });
});
