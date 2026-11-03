import { describe, expect, it } from "vitest";
import {
  cameraAt,
  defaultRecipe,
  validateRecipe,
  type Recipe,
} from "../src/world-builder/recipe";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { createRoute } from "../src/world-builder/mod-routes";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { avatarPoseAt } from "../src/world-builder/avatar-path";
import {
  sceneMetres,
  sceneSizeBounds,
  resizeScene,
} from "../src/world-builder/scene-size";
import { factorPrimitiveScale } from "../src/world-builder/scene-bounds";
import { scaledAxes } from "../src/world-builder/scene-contract";
import { roomPointInside } from "../src/world-builder/scene-room";

function boxRecipe(extra: Partial<Recipe> = {}) {
  return validateRecipe({
    ...defaultRecipe,
    audioRoutes: [],
    objects: [
      {
        id: "building",
        shape: "box",
        x: 0,
        y: 5,
        z: 0,
        scale: 5,
        scaleX: 2,
        scaleY: 2,
        scaleZ: 4,
        spin: 0,
        color: "#aabbcc",
        prompt: "",
      },
    ],
    ...extra,
  });
}

describe("metre-based scene size", () => {
  it("scales every saved state, camera and travel path while retaining a human-sized reference", () => {
    const recipe = createMotionPreset("city-to-loft");
    recipe.avatar = true;
    recipe.avatarPose = { x: 2, y: 12, z: 1, yaw: 0.3, pitch: 0.2 };
    recipe.avatarPath = [
      { frame: 192, pose: { x: 1, y: 0, z: -3, yaw: 1 }, ease: "fall" },
    ];
    recipe.audioRoutes = [
      createRoute({
        id: "rise",
        target: "primitives",
        property: "height",
        amount: 0.4,
      }),
      createRoute({
        id: "jump",
        target: "avatar",
        property: "height",
        amount: 0.6,
      }),
    ];
    recipe.bandEnvelopes.low = Array(recipe.frames).fill(0.7);
    const before = structuredClone(recipe),
      enlarged = resizeScene(recipe, 2);
    expect(recipe).toEqual(before);
    expect(enlarged.sceneSize).toEqual({ version: 1, factor: 2 });
    expect(enlarged.avatarMotion).toEqual(recipe.avatarMotion);
    expect(enlarged.avatarPose.yaw).toBe(recipe.avatarPose.yaw);
    expect(enlarged.avatarPose.pitch).toBe(recipe.avatarPose.pitch);
    expect(enlarged.cameraMotion!.audio).toEqual(recipe.cameraMotion!.audio);
    expect(enlarged.audioRoutes.map((route) => route.amount)).toEqual([
      0.8, 0.6,
    ]);
    expect(enlarged.frames).toBe(recipe.frames);
    expect(enlarged.seconds).toBe(recipe.seconds);
    expect(enlarged.bandEnvelopes).toEqual(recipe.bandEnvelopes);
    for (const frame of [0, 24, 96, 151, 192]) {
      const actual = evaluateScene(enlarged, frame).objects,
        original = evaluateScene(recipe, frame).objects;
      expect(actual.map((part) => part.id)).toEqual(
        original.map((part) => part.id),
      );
      actual.forEach((part, index) => {
        for (const field of ["x", "y", "z", "scale"] as const)
          expect(part[field]).toBeCloseTo(original[index][field] * 2, 5);
      });
      cameraAt(enlarged, frame).forEach((value, axis) =>
        expect(value).toBeCloseTo(cameraAt(recipe, frame)[axis] * 2, 5),
      );
      const pose = avatarPoseAt(enlarged, frame),
        oldPose = avatarPoseAt(recipe, frame);
      for (const axis of ["x", "y", "z"] as const)
        expect(pose[axis]).toBeCloseTo(oldPose[axis] * 2, 5);
    }
    expect(sceneMetres(enlarged).mannequinHeight).toBe(1.8);
  });

  it("uses absolute factors and retains size through repeat edits and JSON import", () => {
    const original = boxRecipe();
    const twice = resizeScene(original, 2),
      thrice = resizeScene(twice, 3);
    expect(sceneMetres(thrice).dimensions).toEqual([30, 30, 60]);
    expect(resizeScene(thrice, 3)).toEqual(thrice);
    const restored = resizeScene(
      validateRecipe(JSON.parse(JSON.stringify(thrice))),
      1,
    );
    expect(restored.objects).toEqual(original.objects);
    expect(cameraAt(restored, 33)).toEqual(cameraAt(original, 33));
    expect(restored.sceneSize!.factor).toBe(1);
    expect(restored.depthNear).toBe(original.depthNear);
    expect(restored.depthFar).toBe(original.depthFar);
  });

  it("scales aliased in-memory saved transforms once, like their JSON representation", () => {
    const recipe = boxRecipe();
    const common = { x: 2, y: 3, z: 4, scale: 2 };
    recipe.motion = {
      version: 1,
      pivot: [0, 0, 0],
      intensity: 1,
      mappings: [],
      stateKeys: [0, 96].map((frame, index) => ({
        id: `key-${index}`,
        label: `Key ${index}`,
        frame,
        easing: "linear",
        objects: { building: common },
      })),
    };
    const scaled = resizeScene(recipe, 2);
    expect(scaled.motion!.stateKeys.map((key) => key.objects.building)).toEqual(
      [
        { x: 4, y: 6, z: 8, scale: 4 },
        { x: 4, y: 6, z: 8, scale: 4 },
      ],
    );
    expect(scaled).toEqual(resizeScene(JSON.parse(JSON.stringify(recipe)), 2));
    expect(common).toEqual({ x: 2, y: 3, z: 4, scale: 2 });
  });

  it("moves the physical room, its surfaces, sources and all state dimensions together", () => {
    const recipe = createMotionPreset("apartment-morph");
    recipe.bandEnvelopes.low = Array(recipe.frames).fill(0.8);
    const resized = resizeScene(recipe, 3);
    for (const frame of [0, 40, 72, 130, 144]) {
      const original = evaluateScene(recipe, frame),
        actual = evaluateScene(resized, frame);
      const room = actual.room!;
      room.dimensions.forEach((v, i) =>
        expect(v).toBeCloseTo(original.room!.dimensions[i] * 3, 5),
      );
      room.source.forEach((v, i) =>
        expect(v).toBeCloseTo(original.room!.source[i] * 3, 5),
      );
      room.listener.forEach((v, i) =>
        expect(v).toBeCloseTo(original.room!.listener[i] * 3, 5),
      );
      expect(roomPointInside(room.source, room.dimensions)).toBe(true);
      expect(roomPointInside(room.listener, room.dimensions)).toBe(true);
      expect(sceneMetres(resized, frame).roomDimensions).toEqual(
        room.dimensions,
      );
      const floor = actual.objects.find((p) => p.id.endsWith("-floor"))!;
      expect(floor.scaleX).toBeCloseTo(
        room.dimensions[0] + room.wallThickness * 2,
      );
      expect(room.absorption).toEqual(original.room!.absorption);
    }
  });

  it("keeps explicit zone boundaries and opening areas in step with the camera and geometry", () => {
    const recipe = boxRecipe({
      cameraMotion: {
        version: 1,
        enabled: true,
        keys: [
          {
            id: "inside",
            frame: 0,
            position: [0, 2, 4],
            target: [0, 2, 0],
            fov: 55,
            easing: "linear",
          },
        ],
        audio: { enabled: false, source: "sub", amount: 0.2 },
      },
      motion: {
        version: 1,
        pivot: [0, 0, 0],
        mappings: [],
        intensity: 1,
        stateKeys: [
          {
            id: "still",
            label: "Still",
            frame: 0,
            easing: "linear",
            objects: {},
          },
        ],
        acousticListener: "camera",
        acousticZones: [
          {
            id: "hall",
            label: "Hall",
            kind: "room",
            center: [0, 0, 0],
            dimensions: [10, 8, 12],
            source: [0, 1, 0],
            seed: 1,
            absorption: {
              floor: 0.1,
              ceiling: 0.1,
              north: 0.1,
              south: 0.1,
              east: 0.1,
              west: 0.1,
            },
            openings: [{ face: "floor", areaM2: 4 }],
          },
        ],
      },
    });
    const resized = resizeScene(recipe, 2),
      zone = resized.motion!.acousticZones![0];
    expect(zone.dimensions).toEqual([20, 16, 24]);
    expect(zone.kind === "room" && zone.source).toEqual([0, 2, 0]);
    expect(zone.kind === "room" && zone.openings![0].areaM2).toBe(16);
    expect(sceneMetres(resized).roomDimensions).toEqual([20, 16, 24]);
    resized.cameraMotion!.keys[0].position = [100, 4, 8];
    expect(sceneMetres(resized).roomDimensions).toBeUndefined();
  });

  it("measures rotated native planes and spheres without confusing extents with an enclosure", () => {
    const recipe = boxRecipe({
      objects: [
        {
          id: "floor",
          shape: "plane",
          x: 0,
          y: 0,
          z: 0,
          scale: 3,
          scaleX: 2,
          scaleY: 4,
          rotationX: -Math.PI / 2,
          spin: 0,
          color: "#aabbcc",
          prompt: "",
        },
      ],
    });
    const size = sceneMetres(recipe);
    expect(size.dimensions[0]).toBeCloseTo(12);
    expect(size.dimensions[1]).toBeCloseTo(0);
    expect(size.dimensions[2]).toBeCloseTo(24);
    expect(size.roomDimensions).toBeUndefined();
    const sphere = boxRecipe({
      objects: [
        {
          ...recipe.objects[0],
          shape: "sphere",
          rotationX: 0,
          scale: 2,
          scaleX: 1,
          scaleY: 1,
        },
      ],
    });
    sceneMetres(sphere).dimensions.forEach((v) =>
      expect(v).toBeCloseTo(2.6, 6),
    );
    expect(sceneMetres(boxRecipe({ objects: [] })).dimensions).toEqual([
      0, 0, 0,
    ]);
  });

  it("narrows the slider to authored bounds and rejects geometry clipping", () => {
    const recipe = boxRecipe();
    recipe.objects[0].x = 125;
    expect(sceneSizeBounds(recipe)).toEqual({ min: 0.25, max: 1.6 });
    expect(resizeScene(recipe, 1.6).objects[0].x).toBe(200);
    expect(() => resizeScene(recipe, 2)).toThrow(/1.6/);
    recipe.objects[0].x = 0;
    recipe.objects[0].scale = 16;
    expect(sceneSizeBounds(recipe).max).toBe(2);
    const room = createMotionPreset("apartment-morph");
    room.motion!.room!.dimensions = [100, 50, 100];
    expect(sceneSizeBounds(room).max).toBe(1.2);
    expect(() => resizeScene(room, 1.3)).toThrow(/1.2/);
  });

  it("keeps source wall clearance and camera look distance valid at the minimum size", () => {
    const recipe = createMotionPreset("apartment-morph");
    recipe.motion!.room!.source = [0, 0.075, 0];
    const bounds = sceneSizeBounds(recipe);
    expect(bounds.min).toBeGreaterThanOrEqual(2 / 3);
    expect(() => resizeScene(recipe, bounds.min)).not.toThrow();
    expect(() => resizeScene(recipe, 0.5)).toThrow(/supports sizes/);
  });

  it("preserves enlarged manipulated parts through a bounded scale factorization", () => {
    const fields = factorPrimitiveScale([16, 100, 4], 4);
    expect(fields.scale).toBe(12.5);
    expect(scaledAxes(fields)).toEqual([16, 100, 4]);
    const recipe = boxRecipe();
    recipe.objects[0] = { ...recipe.objects[0], ...fields };
    expect(sceneMetres(validateRecipe(recipe)).dimensions).toEqual([
      16, 100, 4,
    ]);
    expect(() => factorPrimitiveScale([300, 2, 2])).toThrow(/limits/);
    expect(() => factorPrimitiveScale([1, 0.001, 1])).toThrow(/limits/);
    expect(() => factorPrimitiveScale([1, NaN, 1])).toThrow(/finite/);
    const scale = 0.156782;
    const boundary = factorPrimitiveScale(
      [scale * 8, scale * 0.1, scale],
      scale,
    );
    expect(boundary.scaleX).toBeLessThanOrEqual(8);
    expect(boundary.scaleY).toBeGreaterThanOrEqual(0.1);
    scaledAxes(boundary).forEach((value, axis) =>
      expect(value).toBeCloseTo([scale * 8, scale * 0.1, scale][axis], 12),
    );
  });

  it("validates expanded metre limits and refuses unsupported scenes or malformed scale metadata", () => {
    const recipe = boxRecipe();
    recipe.objects[0].y = 120;
    recipe.objects[0].scale = 32;
    expect(() => validateRecipe(recipe)).not.toThrow();
    expect(() =>
      validateRecipe({
        ...recipe,
        sceneSize: { version: 1, factor: Infinity },
      }),
    ).toThrow(/size/);
    expect(() =>
      validateRecipe({
        ...recipe,
        sceneSize: { version: 1, factor: 1, guessedRoom: true },
      }),
    ).toThrow(/metadata/);
    expect(() => resizeScene({ ...recipe, scene: "playground" }, 2)).toThrow(
      /Stage/,
    );
    expect(() => resizeScene({ ...recipe, scene: "neuro" }, 2)).toThrow(
      /Stage/,
    );
    recipe.objects[0].y = 201;
    expect(() => validateRecipe(recipe)).toThrow(/primitive/);
  });
});
