import { describe, expect, it } from "vitest";
import {
  Box3,
  Euler,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import {
  createMotionPreset,
  MOTION_PRESETS,
  motionPresets,
} from "../src/world-builder/motion-presets";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import {
  cameraAt,
  cameraFovAt,
  cameraTargetAt,
  validateRecipe,
  type Prop,
} from "../src/world-builder/recipe";

function corners(p: Prop) {
  const matrix = new Matrix4().compose(
    new Vector3(p.x, p.y, p.z),
    new Quaternion().setFromEuler(
      new Euler(p.rotationX ?? 0, p.rotation ?? 0, p.rotationZ ?? 0),
    ),
    new Vector3(
      p.scale * (p.scaleX ?? 1),
      p.scale * (p.scaleY ?? 1),
      p.scale * (p.scaleZ ?? 1),
    ),
  );
  return [-0.5, 0.5].flatMap((x) =>
    [-0.5, 0.5].flatMap((y) =>
      [-0.5, 0.5].map((z) => new Vector3(x, y, z).applyMatrix4(matrix)),
    ),
  );
}

describe("editable scene motion presets", () => {
  it("ships fresh bounded recipes with ordered states and declared camera behavior", () => {
    const catalogue = motionPresets();
    expect(catalogue).toHaveLength(MOTION_PRESETS.length);
    expect(new Set(catalogue.map((p) => p.id)).size).toBe(catalogue.length);
    for (const definition of MOTION_PRESETS) {
      const recipe = createMotionPreset(definition.id);
      expect(validateRecipe(recipe)).toEqual(recipe);
      expect(JSON.stringify(recipe).length).toBeLessThan(64_000);
      expect(recipe.objects.length).toBeLessThanOrEqual(24);
      expect(recipe.motion?.instances?.count ?? 0).toBeLessThanOrEqual(256);
      const times = recipe.motion!.stateKeys.map((k) => k.frame);
      expect(times.length).toBeGreaterThanOrEqual(3);
      expect(times[0]).toBe(0);
      expect(times[1]).toBeGreaterThan(0);
      expect(times[1]).toBeLessThan(recipe.frames - 1);
      expect(times.at(-1)).toBe(recipe.frames - 1);
      expect(recipe.orbit).toBe(0);
      expect(recipe.dolly).toBe(0);
      expect(recipe.envelope).toEqual([]);
      expect(recipe.bandEnvelopes).toEqual({
        low: [],
        mid: [],
        high: [],
        sub: [],
      });
      recipe.motion!.stateKeys[0].label = "Edited";
      expect(
        createMotionPreset(definition.id).motion!.stateKeys[0].label,
      ).not.toBe("Edited");
    }
    expect(() => createMotionPreset("unknown")).toThrow(
      /Unknown motion preset/,
    );
  });

  it("retains the same block identities and materials across direct and reverse seeks", () => {
    for (const { id } of MOTION_PRESETS) {
      const recipe = createMotionPreset(id);
      if (!recipe.motion?.instances) continue;
      const before = structuredClone(recipe);
      const frames = Array.from({ length: 5 }, (_, i) =>
        Math.round(((recipe.frames - 1) * i) / 4),
      );
      const signatures = frames.map((frame) => evaluateScene(recipe, frame));
      const first = signatures[0].objects.map((p) => [p.id, p.shape, p.color]);
      expect(first).toHaveLength(recipe.motion.instances.count);
      for (let i = signatures.length - 1; i >= 0; i--) {
        expect(evaluateScene(recipe, frames[i])).toEqual(signatures[i]);
        expect(
          signatures[i].objects.map((p) => [p.id, p.shape, p.color]),
        ).toEqual(first);
      }
      expect(recipe).toEqual(before);
      expect(signatures[0].objects).not.toEqual(signatures[2].objects);
      expect(signatures[2].objects).not.toEqual(signatures[4].objects);
    }
  });

  it("frames fixed object studies and each traveling city's opening skyline", () => {
    for (const definition of MOTION_PRESETS) {
      const recipe = createMotionPreset(definition.id);
      const camera = new PerspectiveCamera(
        recipe.fov,
        recipe.width / recipe.height,
        0.05,
        600,
      );
      // The later city camera enters the architecture. It deliberately cannot
      // show every wall and floor at once, unlike the fixed object studies.
      const keys = recipe.cameraMotion?.enabled
        ? recipe.motion!.stateKeys.slice(0, 1)
        : recipe.motion!.stateKeys;
      for (const key of keys) {
        camera.fov = cameraFovAt(recipe, key.frame);
        camera.position.fromArray(cameraAt(recipe, key.frame));
        camera.lookAt(...cameraTargetAt(recipe, key.frame));
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        for (const prop of evaluateScene(recipe, key.frame, { audio: false })
          .objects)
          for (const corner of corners(prop)) {
            const projected = corner.project(camera);
            expect(
              Math.abs(projected.x),
              `${definition.id}/${key.label}/${prop.id} x`,
            ).toBeLessThan(0.95);
            expect(
              Math.abs(projected.y),
              `${definition.id}/${key.label}/${prop.id} y`,
            ).toBeLessThan(0.95);
            expect(projected.z).toBeGreaterThan(-1);
            expect(projected.z).toBeLessThan(1);
          }
      }
    }
  });

  it("keeps traveling camera position, target and lens finite through the interiors", () => {
    for (const id of ["city-to-loft", "neo-tokyo-to-loft"]) {
      const recipe = createMotionPreset(id);
      expect(recipe.cameraMotion?.enabled).toBe(true);
      expect(cameraAt(recipe, 0)).not.toEqual(
        cameraAt(recipe, recipe.frames - 1),
      );
      for (const frame of [0, 48, 96, 144, 192]) {
        const position = cameraAt(recipe, frame);
        const target = cameraTargetAt(recipe, frame);
        expect(
          [...position, ...target, cameraFovAt(recipe, frame)].every(
            Number.isFinite,
          ),
        ).toBe(true);
        expect(
          new Vector3(...position).distanceTo(new Vector3(...target)),
        ).toBeGreaterThan(0.1);
      }
    }
  });

  it("uses distinct crescent, tall and round fruit silhouettes", () => {
    const recipe = createMotionPreset("fruit-morph");
    const dimensions = recipe.motion!.stateKeys.map((key) => {
      const box = new Box3().setFromPoints(
        evaluateScene(recipe, key.frame).objects.flatMap(corners),
      );
      return box.getSize(new Vector3());
    });
    expect(dimensions[0].x / dimensions[0].y).toBeGreaterThan(1.4);
    expect(dimensions[1].y / dimensions[1].x).toBeGreaterThan(1.5);
    expect(dimensions[2].x / dimensions[2].y).toBeGreaterThan(0.7);
    expect(dimensions[2].x / dimensions[2].y).toBeLessThan(1.3);
  });

  it("routes low, mid, high and level independently into bounded motion", () => {
    const base = createMotionPreset("fruit-morph");
    const silence = evaluateScene(base, 36);
    for (const [source, property] of [
      ["low", "twistY"],
      ["mid", "twistX"],
      ["high", "spread"],
    ] as const) {
      const recipe = structuredClone(base);
      recipe.bandEnvelopes[source] = Array(recipe.frames).fill(1);
      const driven = evaluateScene(recipe, 36);
      expect(driven.controls[property]).toBeGreaterThan(
        silence.controls[property],
      );
      expect(driven.authoredFrame).toBe(36);
      expect(evaluateScene(recipe, 36, { audio: false }).objects).toEqual(
        silence.objects,
      );
    }
    const level = { ...base, envelope: Array(base.frames).fill(1) };
    expect(evaluateScene(level, 36).authoredFrame).toBeGreaterThan(36);
  });

  it("lets prepared sub-bass advance the mecha's authored transformation", () => {
    const recipe = createMotionPreset("spacecraft-mecha");
    const neutral = evaluateScene(recipe, 36);
    recipe.bandEnvelopes.sub = Array(recipe.frames).fill(1);
    expect(evaluateScene(recipe, 36).authoredFrame).toBeGreaterThan(
      neutral.authoredFrame,
    );
    expect(evaluateScene(recipe, 36, { audio: false }).objects).toEqual(
      neutral.objects,
    );
  });

  it("declares the acoustic room separately from decorative geometry", () => {
    expect(createMotionPreset("fruit-morph").motion!.room).toBeUndefined();
    expect(
      createMotionPreset("voxel-architecture").motion!.room,
    ).toBeUndefined();
    const architecture = createMotionPreset("cathedral-street");
    expect(architecture.motion!.room).toMatchObject({
      id: "architecture-proxy",
      visible: false,
    });
    const apartment = createMotionPreset("apartment-morph");
    expect(apartment.motion!.room).toMatchObject({
      id: "apartment",
      visible: true,
      cutaway: true,
    });
    expect(evaluateScene(apartment, 0).room?.dimensions).toEqual([
      5.6, 2.8, 4.5,
    ]);
    expect(evaluateScene(apartment, 144).room?.dimensions).toEqual([
      10, 4.3, 8,
    ]);
    expect(apartment.objects).toHaveLength(12);
  });
});
