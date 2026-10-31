import { describe, expect, it } from "vitest";
import {
  cameraAt,
  cameraFovAt,
  cameraTargetAt,
  presetRecipe,
  validateRecipe,
  type Recipe,
} from "../src/world-builder/recipe";
import { shotCameraPatch } from "../src/world-builder/shot-camera-edit";
import type { SceneCameraPose } from "../src/world-builder/scene-camera-blend";
import { defaultStateAudio } from "../src/world-builder/scene-state-audio";
import { defaultMorphControl } from "../src/world-builder/scene-morph-control";

function keyed(): Recipe {
  const recipe = presetRecipe("Studio");
  const frames = [0, Math.floor((recipe.frames - 1) / 2), recipe.frames - 1];
  return validateRecipe({
    ...recipe,
    objects: [],
    cameraMotion: {
      version: 1,
      enabled: true,
      keys: frames.map((frame, i) => ({
        id: `view-${i}`,
        frame,
        position: [12 - i * 8, 10 + i * 2, 20 + i],
        target: [i, 2 + i, -i],
        fov: 50 + i * 4,
        easing: "easeInOut",
      })),
      audio: { enabled: false, source: "sub", amount: 0.6, motion: "push" },
    },
    motion: {
      version: 1,
      intensity: 1,
      pivot: [0, 0, 0],
      mappings: [],
      stateKeys: frames.map((frame, i) => ({
        id: `state-${i}`,
        label: `State ${i}`,
        frame,
        easing: "easeInOut",
        objects: {},
      })),
    },
  });
}

function pose(recipe: Recipe, frame: number): SceneCameraPose {
  return {
    position: [...cameraAt(recipe, frame)],
    target: [...cameraTargetAt(recipe, frame)],
    fov: cameraFovAt(recipe, frame),
  };
}

function expectPose(actual: SceneCameraPose, expected: SceneCameraPose) {
  actual.position.forEach((value, i) =>
    expect(value).toBeCloseTo(expected.position[i], 10),
  );
  actual.target.forEach((value, i) =>
    expect(value).toBeCloseTo(expected.target[i], 10),
  );
  expect(actual.fov).toBeCloseTo(expected.fov, 10);
}

describe("authored Shot camera gestures", () => {
  it("seeds an exact static view beyond the legacy radius and target-Y clamps", () => {
    const recipe = presetRecipe("Studio"),
      view: SceneCameraPose = {
        position: [22, 40, 70],
        target: [2, 20, -4],
        fov: 73,
      },
      next = validateRecipe({
        ...recipe,
        ...shotCameraPatch(recipe, 24, view),
      });
    expect(recipe.cameraMotion).toBeUndefined();
    expect(next.cameraMotion!.keys).toHaveLength(1);
    for (const frame of [0, 24, next.frames - 1, 3, 0])
      expectPose(pose(next, frame), view);
  });

  it("updates the contributing camera key and keeps the current frame exact", () => {
    const recipe = keyed(),
      before = structuredClone(recipe),
      frame = 35,
      view = pose(recipe, frame);
    view.position = [
      view.position[0] + 3,
      view.position[1] + 1,
      view.position[2] - 2,
    ];
    view.target = [2, 4, -3];
    view.fov = 61;
    const next = validateRecipe({
      ...recipe,
      ...shotCameraPatch(recipe, frame, view),
    });
    expect(recipe).toEqual(before);
    expect(next.cameraMotion!.keys).toHaveLength(3);
    expect(next.cameraMotion!.keys[0]).toEqual(recipe.cameraMotion!.keys[0]);
    expect(next.cameraMotion!.keys[2]).toEqual(recipe.cameraMotion!.keys[2]);
    expectPose(pose(next, frame), view);
    expectPose(pose(JSON.parse(JSON.stringify(next)), frame), view);
  });

  it("replaces an analytic legacy move with the exact manually edited view", () => {
    const recipe = keyed();
    recipe.orbit = 180;
    recipe.cameraMotion!.base = "legacy";
    recipe.cameraMotion!.orbit = { axis: "x", turns: 1 };
    recipe.cameraMotion!.audio.enabled = true;
    recipe.bandEnvelopes.sub = Array(recipe.frames).fill(0.5);
    const view = pose(recipe, 31);
    view.position[0] += 2;
    view.target[1] += 0.4;
    const next = validateRecipe({
      ...recipe,
      ...shotCameraPatch(recipe, 31, view),
    });
    expect(next.cameraMotion!.base).toBeUndefined();
    expect(next.cameraMotion!.keys).toHaveLength(1);
    expect(next.cameraMotion!.orbit).toBeUndefined();
    expect(next.cameraMotion!.audio.enabled).toBe(false);
    for (const frame of [31, 0, next.frames - 1])
      expectPose(pose(next, frame), view);
  });

  for (const response of ["push", "lift"] as const)
    for (const follow of ["state-audio", "manual-morph"] as const)
      it(`keeps ${response}, orbit and ${follow} dynamic without baking twice`, () => {
        const recipe = keyed(),
          frame = 29;
        recipe.cameraMotion!.followMorph = true;
        recipe.cameraMotion!.orbit = { axis: "y", turns: 0.75 };
        recipe.cameraMotion!.audio = {
          enabled: true,
          source: "sub",
          amount: 0.8,
          motion: response,
        };
        recipe.bandEnvelopes = {
          sub: Array(recipe.frames).fill(0.8),
          low: Array(recipe.frames).fill(0.3),
          mid: Array(recipe.frames).fill(0.9),
          high: Array(recipe.frames).fill(0.1),
        };
        if (follow === "state-audio") {
          recipe.motion!.stateAudio = defaultStateAudio(recipe.motion!);
          recipe.motion!.stateAudio.enabled = true;
        } else {
          recipe.motion!.morphControl = defaultMorphControl(recipe.motion!);
          recipe.motion!.morphControl.enabled = true;
          recipe.motion!.morphControl.progress.position = 0.67;
          recipe.motion!.morphControl.progress.amount = 0;
          recipe.motion!.morphControl.target.position = 0.3;
          recipe.motion!.morphControl.target.amount = 0;
        }
        const view = pose(recipe, frame);
        view.position[0] += 1.5;
        view.position[1] -= 0.7;
        view.target[2] += 0.8;
        const next = validateRecipe({
          ...recipe,
          ...shotCameraPatch(recipe, frame, view),
        });
        expect(next.cameraMotion!.audio).toEqual(recipe.cameraMotion!.audio);
        expect(next.cameraMotion!.orbit).toEqual(recipe.cameraMotion!.orbit);
        expect(next.motion).toEqual(recipe.motion);
        expectPose(pose(next, frame), view);
        const again = validateRecipe({
          ...next,
          ...shotCameraPatch(next, frame, view),
        });
        expectPose(pose(again, frame), view);
        for (const sampled of [0, next.frames - 1, frame, 7, frame])
          expect(pose(next, sampled).position.every(Number.isFinite)).toBe(
            true,
          );
      });

  it("inverts the bounded close-range push and refuses an out-of-bounds key", () => {
    const recipe = keyed();
    recipe.cameraMotion!.keys = [
      {
        id: "near",
        frame: 0,
        position: [0, 2, 1],
        target: [0, 2, 0],
        fov: 55,
        easing: "linear",
      },
    ];
    recipe.cameraMotion!.audio.enabled = true;
    recipe.bandEnvelopes.sub = Array(recipe.frames).fill(1);
    const view: SceneCameraPose = {
      position: [0.2, 2, 0.3],
      target: [0, 2, 0],
      fov: 55,
    };
    const next = validateRecipe({
      ...recipe,
      ...shotCameraPatch(recipe, 10, view),
    });
    expectPose(pose(next, 10), view);
    expect(() =>
      validateRecipe({
        ...recipe,
        ...shotCameraPatch(recipe, 10, { ...view, position: [100, 2, 1] }),
      }),
    ).toThrow(/Camera keys/);
  });
});
