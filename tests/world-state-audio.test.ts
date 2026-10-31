import { describe, expect, it } from "vitest";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import {
  defaultStateAudio,
  stateAudioWeights,
} from "../src/world-builder/scene-state-audio";
import { defaultMorphControl } from "../src/world-builder/scene-morph-control";
import {
  cameraAt,
  cameraFovAt,
  validateRecipe,
} from "../src/world-builder/recipe";
import { sceneTransformOf } from "../src/world-builder/scene-state";

function scene() {
  const recipe = createMotionPreset("voxel-architecture");
  recipe.motion!.mappings = [];
  recipe.motion!.intensity = 1;
  recipe.motion!.stateAudio = {
    ...defaultStateAudio(recipe.motion!),
    enabled: true,
    amount: 1,
  };
  recipe.cameraMotion = {
    version: 1,
    enabled: true,
    followMorph: true,
    keys: recipe.motion!.stateKeys.map((key, i) => ({
      id: `camera-${i}`,
      frame: key.frame,
      easing: "linear",
      position: [i * 4, 8, 18],
      target: [0, 1, 0],
      fov: 45 + i * 10,
    })),
    audio: { enabled: false, source: "sub", amount: 0, motion: "push" },
  };
  recipe.envelope = [];
  recipe.bandEnvelopes = { low: [], mid: [], high: [], sub: [] };
  return validateRecipe(recipe);
}

describe("timeline progression with audio pulls toward saved states", () => {
  it("keeps the exact authored movement when signals are missing, disabled or neutral", () => {
    const recipe = scene();
    const baseline = structuredClone(recipe);
    delete baseline.motion!.stateAudio;
    for (const style of ["direct", "scatter", "twist", "assemble"] as const) {
      recipe.motion!.transitionStyle = baseline.motion!.transitionStyle = style;
      for (const frame of [0, 18.5, 72, 107, 144]) {
        expect(evaluateScene(recipe, frame).objects).toEqual(
          evaluateScene(baseline, frame).objects,
        );
        expect(cameraAt(recipe, frame)).toEqual(cameraAt(baseline, frame));
      }
    }
    recipe.bandEnvelopes.low = Array(145).fill(1);
    recipe.motion!.stateAudio!.amount = 0;
    expect(evaluateScene(recipe, 42).objects).toEqual(
      evaluateScene(baseline, 42).objects,
    );
    recipe.motion!.stateAudio!.amount = 1;
    expect(evaluateScene(recipe, 42, { audio: false }).objects).toEqual(
      evaluateScene(baseline, 42).objects,
    );
  });

  it.each(["low", "mid", "high"] as const)(
    "can pull directly to every state, including A, with %s",
    (band) => {
      const recipe = scene();
      const index = ["low", "mid", "high"].indexOf(band);
      recipe.bandEnvelopes[band] = Array(145).fill(1);
      const expected = evaluateScene(
        recipe,
        recipe.motion!.stateKeys[index].frame,
        { audio: false },
      );
      const actual = evaluateScene(recipe, 50);
      actual.objects.forEach((object, i) => {
        const transform = sceneTransformOf(object),
          target = sceneTransformOf(expected.objects[i]);
        for (const key of ["x", "y", "z", "scale"] as const)
          expect(transform[key]).toBeCloseTo(target[key], 12);
      });
      expect(cameraAt(recipe, 50)).toEqual([index * 4, 8, 18]);
      expect(cameraFovAt(recipe, 50)).toBe(45 + index * 10);
    },
  );

  it("blends simultaneous bands proportionally and keeps the timed baseline with a partial signal", () => {
    const recipe = scene();
    recipe.bandEnvelopes.low = Array(145).fill(0.2);
    recipe.bandEnvelopes.high = Array(145).fill(0.3);
    expect(stateAudioWeights(recipe, 50)).toEqual({
      strength: 0.5,
      weights: recipe.motion!.stateKeys.map((key, i) => ({
        stateId: key.id,
        weight: [0.4, 0, 0.6][i],
      })),
    });
    const baseline = structuredClone(recipe);
    baseline.cameraMotion!.followMorph = false;
    expect(cameraAt(recipe, 50)[0]).toBeCloseTo(
      cameraAt(baseline, 50)[0] * 0.5 + 4.8 * 0.5,
    );
    const before = JSON.stringify(recipe);
    const expected = evaluateScene(recipe, 31.5);
    evaluateScene(recipe, 130);
    evaluateScene(recipe, 3);
    expect(evaluateScene(recipe, 31.5)).toEqual(expected);
    expect(JSON.stringify(recipe)).toBe(before);
  });

  it("follows the advanced manual plane with the same camera weights and can unlink the camera", () => {
    const recipe = scene();
    recipe.motion!.stateAudio!.enabled = false;
    const plane = defaultMorphControl(recipe.motion!);
    plane.enabled = true;
    plane.progress = { ...plane.progress, position: 0.5, amount: 0 };
    plane.target = { ...plane.target, position: 1, amount: 0 };
    recipe.motion!.morphControl = plane;
    expect(cameraAt(recipe, 10)).toEqual([4, 8, 18]);
    expect(cameraFovAt(recipe, 10)).toBe(55);
    recipe.cameraMotion!.followMorph = false;
    expect(cameraAt(recipe, 10)[0]).toBeCloseTo((4 * 10) / 72);
  });

  it("validates state identities, unique routes, schema versions and bounds", () => {
    const recipe = scene();
    for (const change of [
      { version: 2 },
      { amount: 1.1 },
      { enabled: "yes" },
      {
        routes: [
          { stateId: "missing", source: "low", amount: 1, enabled: true },
        ],
      },
      {
        routes: [
          recipe.motion!.stateAudio!.routes[0],
          recipe.motion!.stateAudio!.routes[0],
        ],
      },
      { routes: [{ ...recipe.motion!.stateAudio!.routes[0], source: "kick" }] },
      { routes: [{ ...recipe.motion!.stateAudio!.routes[0], amount: NaN }] },
    ])
      expect(() =>
        validateRecipe({
          ...recipe,
          motion: {
            ...recipe.motion,
            stateAudio: { ...recipe.motion!.stateAudio, ...change },
          },
        }),
      ).toThrow();
    expect(() =>
      validateRecipe({
        ...recipe,
        cameraMotion: { ...recipe.cameraMotion, followMorph: "yes" },
      }),
    ).toThrow();
  });
});
