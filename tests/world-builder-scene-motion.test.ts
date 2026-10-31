import { describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { defaultRecipe, validateRecipe } from "../src/world-builder/recipe";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { modOf, modsAt } from "../src/world-builder/mod-routes";
import { orbitPosition } from "../src/world-builder/prop-orbit";
import { loopedSpin, loopPeriod } from "../src/world-builder/loop";
import {
  motionInstances,
  sceneTransformOf,
  MAX_EVALUATED_OBJECTS,
  type SceneMotion,
} from "../src/world-builder/scene-state";
import { roomSurfaces } from "../src/world-builder/scene-room";
import {
  twistPoint,
  twistRotation,
} from "../src/world-builder/scene-transform";
import { motionRecipe } from "./scene-motion-fixture";

describe("deterministic scene evaluator", () => {
  it.each([1, 2, 3, 5])(
    "seeks directly, backwards and sequentially with %i keys",
    (count) => {
      const recipe = motionRecipe(count);
      const before = structuredClone(recipe);
      const sequential = Array.from({ length: recipe.frames }, (_, frame) =>
        evaluateScene(recipe, frame),
      );
      for (const frame of [96, 48, 3, 91, 0, 50, 1, 95])
        expect(evaluateScene(recipe, frame)).toEqual(sequential[frame]);
      expect(recipe).toEqual(before);
      for (const key of recipe.motion!.stateKeys) {
        const snapshot = evaluateScene(recipe, key.frame);
        for (const [id, transform] of Object.entries(key.objects)) {
          const object = snapshot.objects.find((p) => p.id === id)!;
          expect(object.x).toBeCloseTo(transform.x, 12);
          expect(object.y).toBeCloseTo(transform.y, 12);
          expect(object.z).toBeCloseTo(transform.z, 12);
          expect(object.scale).toBeCloseTo(transform.scale, 12);
        }
        expect(snapshot.room!.dimensions).toEqual(key.room!.dimensions);
      }
    },
  );

  it("holds its ends, accepts fractional frames and rejects non-finite time", () => {
    const recipe = motionRecipe();
    expect(evaluateScene(recipe, -100)).toEqual(evaluateScene(recipe, 0));
    expect(evaluateScene(recipe, 1000)).toEqual(evaluateScene(recipe, 96));
    expect(evaluateScene(recipe, 0.5).objects[0].x).not.toBe(
      evaluateScene(recipe, 0).objects[0].x,
    );
    expect(() => evaluateScene(recipe, NaN)).toThrow(/finite/);
    expect(() => evaluateScene(recipe, Infinity)).toThrow(/finite/);
  });

  it.each([-1, 1])(
    "can save a new state after crossing the signed angle boundary (%i)",
    (direction) => {
      const recipe = motionRecipe(2, 1);
      const keys = recipe.motion!.stateKeys;
      const axes = ["rotation", "rotationX", "rotationZ"] as const;
      keys.forEach((key, index) => {
        key.easing = "linear";
        for (const axis of axes)
          key.objects["voxel-000"][axis] =
            (direction * (index === 0 ? 170 : -170) * Math.PI) / 180;
      });
      const transform = sceneTransformOf(
        evaluateScene(recipe, 72, { editing: true }).objects[0],
      );
      for (const axis of axes)
        expect(transform[axis]).toBeCloseTo(
          (-direction * 175 * Math.PI) / 180,
          12,
        );
      const inserted = validateRecipe({
        ...recipe,
        motion: {
          ...recipe.motion!,
          stateKeys: [
            keys[0],
            {
              ...keys[0],
              id: "inserted",
              frame: 72,
              objects: { "voxel-000": transform },
            },
            keys[1],
          ],
        },
      });
      expect(
        sceneTransformOf(
          evaluateScene(inserted, 72, { editing: true }).objects[0],
        ),
      ).toEqual(transform);
      for (const key of keys)
        expect(
          sceneTransformOf(
            evaluateScene(inserted, key.frame, { editing: true }).objects[0],
          ),
        ).toMatchObject(key.objects["voxel-000"]);
    },
  );

  it.each([false, true])(
    "preserves old object spin, orbit and matrix output (loop=%s)",
    (loop) => {
      const recipe = validateRecipe({
        ...defaultRecipe,
        loop,
        envelope: Array(97).fill(0.4),
        objects: [
          { ...defaultRecipe.objects[0], orbit: 0.3, orbitX: 2, spin: -0.4 },
        ],
      });
      expect(recipe.motion).toBeUndefined();
      for (const frame of [0, 23, 48, 96]) {
        const p = recipe.objects[0],
          mods = modsAt(recipe, frame);
        const targets = ["primitives", `prop:${p.id}`];
        const object = evaluateScene(recipe, frame).objects[0];
        const [x, z] = orbitPosition(
          p,
          frame / 24,
          loop ? loopPeriod(recipe) : undefined,
        );
        expect(object.x).toBe(x);
        expect(object.z).toBe(z);
        expect(object.y).toBe(p.y + modOf(mods, targets, "height"));
        expect(object.scale).toBe(
          p.scale * (1 + modOf(mods, targets, "scale")),
        );
        expect(object.rotation).toBe(
          (p.rotation ?? 0) +
            ((loop ? loopedSpin(p.spin, loopPeriod(recipe)) : p.spin) * frame) /
              24 +
            modOf(mods, targets, "spin"),
        );
      }
    },
  );

  it("applies bounded audio after authored interpolation and never accumulates it", () => {
    const recipe = motionRecipe();
    recipe.envelope = Array(97).fill(1);
    recipe.bandEnvelopes.low = Array(97).fill(0.5);
    recipe.motion!.mappings = [
      {
        id: "lift",
        source: "level",
        property: "lift",
        amount: 1,
        enabled: true,
      },
      {
        id: "room",
        source: "low",
        property: "roomWidth",
        amount: 4,
        enabled: true,
      },
    ];
    const base = evaluateScene(recipe, 24, { audio: false });
    const driven = evaluateScene(recipe, 24);
    expect(driven.objects[0].y).toBeCloseTo(base.objects[0].y + 1);
    expect(driven.room!.dimensions[0]).toBeCloseTo(
      base.room!.dimensions[0] + 2,
    );
    for (let i = 0; i < 10; i++)
      expect(evaluateScene(recipe, 24)).toEqual(driven);
    recipe.motion!.stateKeys[1].controls = {
      twistX: 1,
      twistY: 1,
      scale: 2,
      lift: 3,
    };
    const edited = evaluateScene(recipe, 48, { editing: true });
    expect(edited.objects[0].y).toBe(
      recipe.motion!.stateKeys[1].objects["voxel-000"].y,
    );
    expect(edited.objects[0].scale).toBe(
      recipe.motion!.stateKeys[1].objects["voxel-000"].scale,
    );
  });

  it("maps loudness to morph time while geometry and acoustic room use that same time", () => {
    const recipe = motionRecipe();
    recipe.envelope = Array(97).fill(0.5);
    recipe.motion!.mappings = [
      {
        id: "morph",
        source: "level",
        property: "morph",
        amount: 0.5,
        enabled: true,
      },
    ];
    const snapshot = evaluateScene(recipe, 24);
    expect(snapshot.authoredFrame).toBe(48);
    expect(snapshot.objects).toEqual(
      evaluateScene(recipe, 48, { audio: false }).objects,
    );
    expect(snapshot.room).toEqual(
      evaluateScene(recipe, 48, { audio: false }).room,
    );
  });

  it("derives six metric surfaces and keeps a cutaway independent of acoustics", () => {
    const recipe = motionRecipe(),
      snapshot = evaluateScene(recipe, 48),
      room = snapshot.room!;
    const surfaces = roomSurfaces(room);
    expect(surfaces).toHaveLength(6);
    expect(snapshot.objects).toHaveLength(8 + 4);
    const floor = surfaces.find((p) => p.id.endsWith("-floor"))!;
    expect(floor.y + floor.scaleY! / 2).toBe(room.center[1]);
    const east = surfaces.find((p) => p.id.endsWith("-east"))!;
    expect(east.x - east.scaleX! / 2).toBeCloseTo(
      room.center[0] + room.dimensions[0] / 2,
    );
    recipe.motion!.room!.cutaway = false;
    expect(evaluateScene(recipe, 48).objects).toHaveLength(8 + 6);
    recipe.motion!.room!.visible = false;
    expect(evaluateScene(recipe, 48).objects).toHaveLength(8);
    expect(evaluateScene(recipe, 48).room!.dimensions).toEqual(room.dimensions);
  });

  it("keeps source/listener inside bounded room compression and saturates combined offsets", () => {
    const recipe = motionRecipe();
    recipe.envelope = Array(97).fill(1);
    recipe.motion!.mappings = Array.from({ length: 16 }, (_, i) => ({
      id: `compress-${i}`,
      source: "level",
      property: "roomWidth",
      amount: -4,
      enabled: true,
    }));
    const room = evaluateScene(recipe, 0).room!;
    expect(room.dimensions[0]).toBe(1);
    expect(room.source[0]).toBe(-0.45);
    expect(room.listener[0]).toBe(0.45);
  });

  it("uses exact X-then-Y rotation for lattice position and XYZ object orientation", () => {
    const p = {
      x: 1,
      y: 2,
      z: 3,
      scale: 1,
      rotationX: 0.23,
      rotation: -0.51,
      rotationZ: 0.19,
    };
    const x = 0.7,
      y = -0.4;
    const expected = new Matrix4()
      .makeRotationY(y)
      .multiply(new Matrix4().makeRotationX(x));
    expect(
      new Vector3(...twistPoint([1, 2, 3], x, y)).distanceTo(
        new Vector3(1, 2, 3).applyMatrix4(expected),
      ),
    ).toBeLessThan(1e-12);
    const rotated = new Quaternion().setFromEuler(
      new Euler(...twistRotation(p, x, y)),
    );
    const base = new Quaternion().setFromEuler(
      new Euler(p.rotationX, p.rotation, p.rotationZ),
    );
    const target = new Quaternion()
      .setFromRotationMatrix(expected)
      .multiply(base);
    expect(1 - Math.abs(rotated.dot(target))).toBeLessThan(1e-12);
  });
});

describe("bounded versioned scene schema", () => {
  it("round-trips motion, retains stable IDs and stays within a separate instance budget", () => {
    const recipe = motionRecipe(3, 128);
    expect(validateRecipe(JSON.parse(JSON.stringify(recipe)))).toEqual(recipe);
    const generated = motionInstances(recipe.motion!.instances!);
    expect(generated).toHaveLength(128);
    expect(new Set(generated.map((p) => p.id)).size).toBe(128);
    expect(motionInstances(recipe.motion!.instances!)).toEqual(generated);
    expect(evaluateScene(recipe, 48).objects.length).toBeLessThanOrEqual(
      MAX_EVALUATED_OBJECTS,
    );
    expect(recipe.objects).toHaveLength(0);
  });

  it.each([
    (m: SceneMotion) => {
      m.version = 2 as 1;
    },
    (m: SceneMotion) => {
      m.instances!.count = 129;
    },
    (m: SceneMotion) => {
      m.instances!.generator = "script" as "voxel-lattice";
    },
    (m: SceneMotion) => {
      m.stateKeys[0].frame = 1;
    },
    (m: SceneMotion) => {
      m.stateKeys[1].frame = 0;
    },
    (m: SceneMotion) => {
      m.stateKeys[1].frame = 1000;
    },
    (m: SceneMotion) => {
      m.stateKeys[1].id = m.stateKeys[0].id;
    },
    (m: SceneMotion) => {
      delete m.stateKeys[1].objects["voxel-000"];
    },
    (m: SceneMotion) => {
      m.stateKeys[1].objects.unknown = m.stateKeys[1].objects["voxel-000"];
    },
    (m: SceneMotion) => {
      m.stateKeys[1].objects["voxel-000"].scale = 0;
    },
    (m: SceneMotion) => {
      m.stateKeys[1].objects["voxel-000"].rotationX = Infinity;
    },
    (m: SceneMotion) => {
      m.room!.absorption.east = 0;
    },
    (m: SceneMotion) => {
      m.stateKeys[1].room!.dimensions = [1, 1, 1];
    },
    (m: SceneMotion) => {
      m.stateKeys[1].room!.source = [0, 99, 0];
    },
  ])("rejects unsafe or contradictory motion inputs %#", (breakMotion) => {
    const recipe = motionRecipe();
    breakMotion(recipe.motion!);
    expect(() => validateRecipe(recipe)).toThrow();
  });

  it("rejects topology, extra enclosures, colliding IDs and unchecked expansion", () => {
    const recipe = motionRecipe();
    const raw = JSON.parse(JSON.stringify(recipe));
    raw.motion.stateKeys[1].objects["voxel-000"].shape = "sphere";
    expect(() => validateRecipe(raw)).toThrow(/topology/);
    raw.motion = { ...recipe.motion, rooms: [recipe.motion!.room] };
    expect(() => validateRecipe(raw)).toThrow();
    expect(() =>
      validateRecipe({
        ...recipe,
        objects: [{ ...defaultRecipe.objects[0], id: "voxel-000" }],
      }),
    ).toThrow(/distinct/);
    expect(() =>
      validateRecipe({
        ...recipe,
        objects: Array.from({ length: 25 }, (_, i) => ({
          ...defaultRecipe.objects[0],
          id: `prop-${i}`,
        })),
      }),
    ).toThrow(/24 primitives/);
  });
});
