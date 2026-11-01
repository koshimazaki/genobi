import { describe, expect, it } from "vitest";
import { createStoryPreset } from "../src/world-builder/story-presets";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import {
  validateRecipe,
  type Prop,
  type Recipe,
} from "../src/world-builder/recipe";
import { scaledAxes } from "../src/world-builder/scene-contract";
import { resizeScene } from "../src/world-builder/scene-size";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { evaluateAcousticEnvironment } from "../src/world-builder/evaluate-acoustic-environment";
import { buildAcousticSchedule } from "../src/world-builder/acoustic-schedule";
import {
  createSceneLoopBank,
  saveSceneLoopSlot,
  sceneLoopSlotRecipe,
  composeSceneLoop,
  validateSceneLoopBank,
} from "../src/world-builder/scene-loop";

function pair(a: Recipe, b = a, aFrame = 0, bFrame = b.frames - 1) {
  let bank = saveSceneLoopSlot(createSceneLoopBank(), 0, a, aFrame);
  bank = saveSceneLoopSlot(bank, 1, b, bFrame);
  return bank;
}

describe("acoustic zones in saved scene loops", () => {
  it("preserves detached zones, openings and listener through saving, JSON restoration and recall", () => {
    const source = createStoryPreset("endless-descent");
    source.motion!.acousticListener = "avatar";
    const expected = structuredClone(source.motion!.acousticZones);
    const bank = saveSceneLoopSlot(createSceneLoopBank(), 0, source, 250);
    const restored = validateSceneLoopBank(JSON.parse(JSON.stringify(bank)));
    const recalled = sceneLoopSlotRecipe(restored, 0);
    expect(recalled.motion!.acousticZones).toEqual(expected);
    expect(recalled.motion!.acousticListener).toBe("avatar");
    expect(evaluateAcousticEnvironment(recalled, 0).zone.id).toBe(
      "descent-cathedral",
    );
    source.motion!.acousticZones![1].dimensions[0] = 27;
    recalled.motion!.acousticZones![1].center[1] = 14;
    expect(bank.slots[0]!.recipe.motion!.acousticZones).toEqual(expected);
    expect(restored.slots[0]!.recipe.motion!.acousticZones).toEqual(expected);
  });

  it("keeps one story's zones while saved camera endpoints cross its street and rooms", () => {
    const story = createStoryPreset("endless-descent");
    const bank = pair(story);
    const before = JSON.stringify(bank);
    const loop = composeSceneLoop(bank, { returnToStart: false });
    expect(loop.motion!.acousticZones).toEqual(story.motion!.acousticZones);
    expect(loop.motion!.acousticListener).toBe("camera");
    expect(evaluateAcousticEnvironment(loop, 0)).toMatchObject({
      kind: "dry",
      zone: { id: "descent-street" },
    });
    expect(evaluateAcousticEnvironment(loop, loop.frames - 1).zone.id).toBe(
      "descent-studio",
    );
    const schedule = buildAcousticSchedule(loop);
    expect([...new Set(schedule.snapshots.map((s) => s.zone?.id))]).toEqual([
      "descent-street",
      "descent-cathedral",
      "descent-club",
      "descent-studio",
    ]);
    const physical = (part: Prop) => [
      part.x,
      part.y,
      part.z,
      ...scaledAxes(part),
      part.rotationX,
      part.rotation,
      part.rotationZ,
      part.color,
    ];
    const start = evaluateScene(bank.slots[0]!.recipe, 0).objects;
    const end = new Map(
      evaluateScene(bank.slots[1]!.recipe, 0).objects.map((part) => [
        part.id,
        part,
      ]),
    );
    const unchanged = start.filter(
      (part) =>
        JSON.stringify(physical(part)) ===
        JSON.stringify(physical(end.get(part.id)!)),
    );
    expect(unchanged.length).toBeGreaterThan(30);
    const middle = new Map(
      evaluateScene(loop, (loop.frames - 1) / 2).objects.map((part) => [
        part.id,
        part,
      ]),
    );
    for (const part of unchanged) {
      const actual = physical(middle.get(part.id)!);
      physical(part).forEach((value, axis) => {
        if (typeof value === "number")
          expect(actual[axis]).toBeCloseTo(value, 11);
        else expect(actual[axis]).toEqual(value);
      });
    }
    expect(JSON.stringify(bank)).toBe(before);
    loop.motion!.acousticZones![0].label = "Changed output";
    expect(JSON.stringify(bank)).toBe(before);
  });

  it("normalizes omitted camera listener and permits camera orbit without rotating architecture", () => {
    const a = createStoryPreset("endless-descent");
    const b = structuredClone(a);
    delete b.motion!.acousticListener;
    const loop = composeSceneLoop(pair(a, b), {
      cameraOrbit: { axis: "y", turns: 1 },
    });
    expect(loop.cameraMotion!.orbit).toEqual({ axis: "y", turns: 1 });
    expect(loop.motion!.rotation).toBeUndefined();
    expect(loop.motion!.acousticZones).toEqual(a.motion!.acousticZones);
  });

  it.each(["scatter", "twist", "assemble"] as const)(
    "refuses %s because it would move geometry away from fixed acoustic zones",
    (style) => {
      expect(() =>
        composeSceneLoop(pair(createStoryPreset("endless-descent")), { style }),
      ).toThrow(/Direct.*Save scene/);
    },
  );

  it("refuses whole-object rotation with actionable guidance", () => {
    expect(() =>
      composeSceneLoop(pair(createStoryPreset("endless-descent")), {
        rotation: { axis: "y", turns: 1 },
      }),
    ).toThrow(/Direct.*Save scene/);
  });

  it("rejects zone loss, differing physical size, materials or listener instead of discarding acoustics", () => {
    const a = createStoryPreset("endless-descent");
    const noZones = structuredClone(a);
    delete noZones.motion!.acousticZones;
    delete noZones.motion!.acousticListener;
    const material = structuredClone(a);
    const room = material.motion!.acousticZones![1];
    if (room.kind === "room") room.absorption.floor = 0.3;
    const listener = structuredClone(a);
    listener.motion!.acousticListener = "avatar";
    for (const b of [noZones, resizeScene(a, 1.1), material, listener])
      expect(() => composeSceneLoop(pair(a, b))).toThrow(
        /identical acoustic zones and listeners.*Save scene/,
      );
  });

  it("rejects incompatible generated counts even when zone metadata matches", () => {
    const a = createStoryPreset("endless-descent"),
      b = structuredClone(a);
    const removed = `voxel-${String(--b.motion!.instances!.count).padStart(3, "0")}`;
    for (const key of b.motion!.stateKeys) delete key.objects[removed];
    expect(() => composeSceneLoop(pair(a, b))).toThrow(
      /same generated blocks.*Save scene/,
    );
  });

  it("retains each authored block identity instead of nearest-neighbour swapping", () => {
    const a = validateRecipe({
      objects: [],
      audioRoutes: [],
      motion: {
        version: 1,
        pivot: [0, 0, 0],
        intensity: 1,
        mappings: [],
        instances: {
          version: 1,
          generator: "voxel-lattice",
          seed: 1,
          count: 2,
          columns: 2,
          spacing: 1,
          size: 1,
          palette: ["#ffffff"],
        },
        acousticZones: [
          {
            id: "street",
            label: "Street",
            kind: "outdoor",
            center: [0, 0, 0],
            dimensions: [20, 10, 20],
          },
        ],
        stateKeys: [
          {
            id: "a",
            label: "A",
            frame: 0,
            easing: "linear",
            objects: {
              "voxel-000": { x: -2, y: 1, z: 0, scale: 1 },
              "voxel-001": { x: 2, y: 1, z: 0, scale: 1 },
            },
          },
        ],
      },
    });
    const b = structuredClone(a);
    b.motion!.stateKeys[0].objects["voxel-000"].x = 2;
    b.motion!.stateKeys[0].objects["voxel-001"].x = -2;
    const loop = composeSceneLoop(pair(a, b, 0, 0), { returnToStart: false });
    const final = new Map(
      evaluateScene(loop, loop.frames - 1).objects.map((part) => [
        part.id,
        part,
      ]),
    );
    expect(final.get("voxel-000")!.x).toBe(2);
    expect(final.get("voxel-001")!.x).toBe(-2);
    expect(
      evaluateScene(loop, (loop.frames - 1) / 2).objects.every(
        (part) => part.x === 0,
      ),
    ).toBe(true);
  });

  it("preserves the existing single-room dimension morph", () => {
    const source = createMotionPreset("apartment-morph");
    const loop = composeSceneLoop(pair(source), { returnToStart: false });
    expect(loop.motion!.acousticZones).toBeUndefined();
    expect(evaluateScene(loop, 0).room!.dimensions).toEqual(
      evaluateScene(source, 0).room!.dimensions,
    );
    expect(evaluateScene(loop, loop.frames - 1).room!.dimensions).toEqual(
      evaluateScene(source, source.frames - 1).room!.dimensions,
    );
  });
});
