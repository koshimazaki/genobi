import { describe, expect, it } from "vitest";
import { captureSceneState } from "../src/world-builder/scene-state-snapshot";
import {
  cameraAt,
  cameraFovAt,
  cameraTargetAt,
  defaultRecipe,
  validateRecipe,
} from "../src/world-builder/recipe";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { defaultMorphControl } from "../src/world-builder/scene-morph-control";
import { defaultStateAudio } from "../src/world-builder/scene-state-audio";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { motionRecipe } from "./scene-motion-fixture";

const camera = {
  position: [61, 35, -42] as [number, number, number],
  target: [0, 20, 0] as [number, number, number],
  fov: 73,
};

describe("paired authored state and camera snapshots", () => {
  it("starts a fresh editable A without changing the original objects or global camera fields", () => {
    const recipe = structuredClone(defaultRecipe),
      before = structuredClone(recipe);
    recipe.objects[0].spin = 0.5;
    recipe.objects[0].orbit = 0.4;
    const saved = captureSceneState(recipe, 20, { camera, editing: true });
    expect(saved.motion!.stateKeys).toHaveLength(1);
    expect(saved.motion!.stateKeys[0]).toMatchObject({
      label: "State A",
      frame: 0,
    });
    expect(saved.objects).toEqual(recipe.objects);
    expect(
      saved.motion!.stateKeys[0].objects[recipe.objects[0].id],
    ).toMatchObject({
      x: recipe.objects[0].x,
      y: recipe.objects[0].y,
      z: recipe.objects[0].z,
    });
    expect(saved.cameraMotion!.keys[0]).toMatchObject(camera);
    expect(saved.cameraMotion!.followMorph).toBe(true);
    for (const field of [
      "radius",
      "azimuth",
      "elevation",
      "fov",
      "targetX",
      "targetY",
      "targetZ",
    ] as const)
      expect(saved[field]).toBe(before[field]);
    expect(recipe.motion).toBeUndefined();
  });

  it("stores an interpolated arrangement and authored controls separately without baking audio twice", () => {
    const recipe = motionRecipe(3, 4);
    recipe.motion!.stateKeys[0].controls = {
      twistY: 0.2,
      scale: 1.2,
      lift: 0.4,
    };
    recipe.motion!.stateKeys[1].controls = {
      twistY: 0.6,
      scale: 1.4,
      lift: 0.8,
    };
    recipe.motion!.mappings = [
      {
        id: "lift",
        source: "level",
        property: "lift",
        amount: 2,
        enabled: true,
      },
    ];
    recipe.envelope = Array(97).fill(0.7);
    const expected = evaluateScene(recipe, 24, { audio: false }),
      before = structuredClone(recipe);
    const saved = captureSceneState(recipe, 24, { targetStateId: "state-1" });
    const actual = evaluateScene(saved, 48, { audio: false });
    for (const part of actual.objects) {
      const original = expected.objects.find((item) => item.id === part.id)!;
      for (const field of ["x", "y", "z", "scale"] as const)
        expect(part[field]).toBeCloseTo(original[field], 11);
    }
    expect(actual.room).toEqual(expected.room);
    expect(saved.motion!.stateKeys[1].controls).toEqual({
      twistY: expected.controls.twistY,
      scale: expected.controls.scale,
      lift: expected.controls.lift,
    });
    expect(saved.motion!.mappings).toEqual(recipe.motion!.mappings);
    expect(saved.envelope).toEqual(recipe.envelope);
    expect(saved.motion!.stateKeys[0]).toEqual(before.motion!.stateKeys[0]);
    expect(recipe).toEqual(before);
  });

  it("captures Build's edited raw state while retaining common identities and material", () => {
    const recipe = motionRecipe(3, 4);
    recipe.motion!.stateKeys[1].objects["voxel-000"].x = 3.75;
    recipe.motion!.stateKeys[1].controls = { twistY: 1.2 };
    recipe.objects.push({
      ...defaultRecipe.objects[0],
      id: "constant-part",
      x: 5,
      spin: 0.3,
    });
    const saved = captureSceneState(recipe, 48, {
      targetStateId: "state-2",
      camera,
      editing: true,
    });
    expect(saved.motion!.stateKeys[2].objects["voxel-000"].x).toBe(3.75);
    const ids = Object.keys(saved.motion!.stateKeys[0].objects).sort();
    for (const key of saved.motion!.stateKeys)
      expect(Object.keys(key.objects).sort()).toEqual(ids);
    expect(ids).toContain("constant-part");
    expect(saved.objects).toEqual(recipe.objects);
    expect(
      saved.cameraMotion!.keys.find((key) => key.frame === 96),
    ).toMatchObject(camera);
  });

  it("appends D, retimes paired cameras, and keeps existing audio routes and manual target selection", () => {
    const recipe = motionRecipe(3, 4);
    recipe.motion!.stateAudio = defaultStateAudio(recipe.motion!);
    recipe.motion!.stateAudio.enabled = true;
    recipe.motion!.morphControl = defaultMorphControl(recipe.motion!);
    recipe.motion!.morphControl.target.position = 0.7;
    recipe.cameraMotion = {
      version: 1,
      enabled: true,
      audio: { enabled: false, source: "sub", amount: 0.2 },
      keys: [0, 48, 96].map((frame, index) => ({
        id: `view-${index}`,
        frame,
        position: [10 + index, 8, 12],
        target: [0, 2, 0],
        fov: 45 + index,
        easing: "easeInOut",
      })),
    };
    const originalRoutes = structuredClone(recipe.motion!.stateAudio.routes);
    const saved = captureSceneState(recipe, 48, { camera, editing: true });
    expect(saved.motion!.stateKeys.map((key) => key.frame)).toEqual([
      0, 32, 64, 96,
    ]);
    expect(saved.motion!.stateKeys.at(-1)!.label).toBe("State D");
    expect(
      saved.cameraMotion!.keys.find((key) => key.frame === 32),
    ).toMatchObject({ position: [11, 8, 12], fov: 46 });
    expect(
      saved.cameraMotion!.keys.find((key) => key.frame === 64),
    ).toMatchObject({ position: [12, 8, 12], fov: 47 });
    expect(
      saved.cameraMotion!.keys.find((key) => key.frame === 96),
    ).toMatchObject(camera);
    expect(saved.motion!.stateAudio!.routes.slice(0, 3)).toEqual(
      originalRoutes,
    );
    expect(saved.motion!.stateAudio!.routes.at(-1)!.enabled).toBe(false);
    expect(saved.motion!.morphControl!.target.position).toBe(0.35);
    expect(saved.motion!.morphControl!.target.routes.at(-1)!.enabled).toBe(
      false,
    );
    expect(() => captureSceneState(saved, 0)).toThrow(/four states/);
  });

  it("allows replacement in a legacy five-state sequence and rejects incompatible structures atomically", () => {
    const recipe = motionRecipe(5, 4);
    expect(
      captureSceneState(recipe, 24, {
        targetStateId: "state-4",
        camera,
        editing: true,
      }).motion!.stateKeys,
    ).toHaveLength(5);
    expect(() => captureSceneState(recipe, 24)).toThrow(/four states/);
    expect(() =>
      captureSceneState(recipe, 24, { targetStateId: "missing" }),
    ).toThrow(/existing state/);
    const broken = structuredClone(recipe);
    delete broken.motion!.stateKeys[2].objects["voxel-000"];
    expect(() =>
      captureSceneState(broken, 24, { targetStateId: "state-4" }),
    ).toThrow(/identities/);
    expect(() =>
      captureSceneState(recipe, NaN, { targetStateId: "state-4" }),
    ).toThrow(/frame/);
    expect(() =>
      captureSceneState(recipe, 24, {
        targetStateId: "state-4",
        camera: { ...camera, target: camera.position },
      }),
    ).toThrow(/Camera/);
  });

  it("keeps captured camera audio dynamic instead of saving its offset twice", () => {
    const recipe = motionRecipe(3, 4);
    recipe.cameraMotion = {
      version: 1,
      enabled: true,
      keys: [
        {
          id: "view",
          frame: 0,
          position: [10, 8, 12],
          target: [0, 2, 0],
          fov: 48,
          easing: "linear",
        },
      ],
      audio: { enabled: true, source: "level", amount: 0.5, motion: "lift" },
    };
    recipe.envelope = Array(97).fill(0.8);
    const actual = {
      position: [...cameraAt(recipe, 24)] as [number, number, number],
      target: [...cameraTargetAt(recipe, 24)] as [number, number, number],
      fov: cameraFovAt(recipe, 24),
    };
    const saved = captureSceneState(recipe, 24, {
      targetStateId: "state-1",
      camera: actual,
    });
    expect(
      saved.cameraMotion!.keys.find((key) => key.frame === 48)!.position,
    ).toEqual([10, 8, 12]);
    expect(cameraAt(saved, 48)).toEqual(actual.position);
  });

  it("reserves soundtrack space when adding dense states", () => {
    const recipe = createMotionPreset("voxel-architecture-256");
    expect(() =>
      captureSceneState(recipe, 0, { camera, editing: true }),
    ).toThrow(/fewer blocks.*fewer states/);
    expect(validateRecipe(recipe)).toEqual(recipe);
  });

  it("keeps procedural object rotation dynamic and saves current camera orbit as fixed views", () => {
    const recipe = motionRecipe(3, 4);
    recipe.motion!.rotation = { axis: "y", turns: 1 };
    recipe.cameraMotion = {
      version: 1,
      enabled: true,
      orbit: { axis: "y", turns: 1 },
      audio: { enabled: false, source: "sub", amount: 0 },
      keys: [
        {
          id: "start",
          frame: 0,
          position: [10, 8, 12],
          target: [0, 2, 0],
          fov: 48,
          easing: "linear",
        },
      ],
    };
    const currentCamera = {
      position: [...cameraAt(recipe, 24)] as [number, number, number],
      target: [...cameraTargetAt(recipe, 24)] as [number, number, number],
      fov: cameraFovAt(recipe, 24),
    };
    const neutral = structuredClone(recipe);
    delete neutral.motion!.rotation;
    const expected = evaluateScene(neutral, 24, { editing: true }).objects[0];
    const saved = captureSceneState(recipe, 24, {
      targetStateId: "state-1",
      camera: currentCamera,
    });
    expect(saved.motion!.rotation).toEqual(recipe.motion!.rotation);
    const stored = saved.motion!.stateKeys[1].objects[expected.id];
    expect(stored.x).toBe(expected.x);
    expect(stored.z).toBe(expected.z);
    expect(saved.cameraMotion!.orbit).toBeUndefined();
    expect(cameraAt(saved, 48)).toEqual(currentCamera.position);
  });
});
