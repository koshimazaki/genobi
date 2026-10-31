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
  it("ships four fresh bounded recipes with all three named states and a fixed camera", () => {
    expect(motionPresets()).toHaveLength(4);
    for (const definition of MOTION_PRESETS) {
      const recipe = createMotionPreset(definition.id);
      expect(validateRecipe(recipe)).toEqual(recipe);
      expect(JSON.stringify(recipe).length).toBeLessThan(64_000);
      expect(recipe.objects.length).toBeLessThanOrEqual(24);
      expect(recipe.motion?.instances?.count ?? 0).toBeLessThanOrEqual(128);
      expect(recipe.motion!.stateKeys.map((k) => k.frame)).toEqual([
        0, 72, 144,
      ]);
      expect(recipe.frames).toBe(145);
      expect(recipe.orbit).toBe(0);
      expect(recipe.dolly).toBe(0);
      expect(recipe.envelope).toEqual([]);
      expect(recipe.bandEnvelopes).toEqual({ low: [], mid: [], high: [] });
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
    for (const id of [
      "voxel-architecture",
      "cathedral-street",
      "fruit-morph",
    ]) {
      const recipe = createMotionPreset(id);
      const before = structuredClone(recipe);
      const signatures = [0, 36, 72, 108, 144].map((frame) =>
        evaluateScene(recipe, frame),
      );
      const first = signatures[0].objects.map((p) => [p.id, p.shape, p.color]);
      expect(first).toHaveLength(id === "fruit-morph" ? 96 : 64);
      for (let i = signatures.length - 1; i >= 0; i--) {
        expect(evaluateScene(recipe, i * 36)).toEqual(signatures[i]);
        expect(
          signatures[i].objects.map((p) => [p.id, p.shape, p.color]),
        ).toEqual(first);
      }
      expect(recipe).toEqual(before);
      expect(signatures[0].objects).not.toEqual(signatures[2].objects);
      expect(signatures[2].objects).not.toEqual(signatures[4].objects);
    }
  });

  it("keeps every endpoint inside the fixed guide frame, including apartment walls", () => {
    for (const definition of MOTION_PRESETS) {
      const recipe = createMotionPreset(definition.id);
      const camera = new PerspectiveCamera(
        recipe.fov,
        recipe.width / recipe.height,
        0.05,
        600,
      );
      camera.position.fromArray(cameraAt(recipe, 0));
      camera.lookAt(...cameraTargetAt(recipe, 0));
      camera.updateMatrixWorld();
      for (const key of recipe.motion!.stateKeys)
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
