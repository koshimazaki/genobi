import { describe, expect, it } from "vitest";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { createMorphComposition } from "../src/world-builder/morph-asset-catalogue";
import { carLayout } from "../src/world-builder/motion-car-layout";
import { createStudy } from "../scripts/experiments/recipes";
import { serializeRecipe } from "../scripts/experiments/contracts";
import { studyRegions } from "../scripts/experiments/regions";
import { shipBounds } from "../scripts/experiments/recipes-ship-mecha";
import {
  CAR_COLOURS,
  CAR_FILL,
} from "../scripts/experiments/recipes-car-mecha";

const dims = (frames: number) => ({ width: 1024, height: 576, frames });
// Every band but low is silent, so the mid twist holds still.
const bands = (frames: number, low: number) => {
  const flat = Array.from({ length: frames }, () => 0);
  return {
    envelope: [...flat],
    bandEnvelopes: {
      sub: [...flat],
      low: Array.from({ length: frames }, () => low),
      mid: [...flat],
      high: [...flat],
    },
  };
};
const study = (low: number, frames = 97) =>
  createStudy("car-mecha", bands(frames, low), dims(frames)).recipe;
const voxels = (recipe: ReturnType<typeof study>, frame: number) =>
  Object.fromEntries(
    evaluateScene(recipe, frame)
      .objects.filter((o) => o.id.startsWith("voxel-"))
      .map((o) => [o.id, o]),
  );

describe("the car form", () => {
  it("is a low, wide wedge of 128 parts on the floor, about 2.2 x 1.0 x 0.7 m", () => {
    const car = carLayout();
    expect(car).toHaveLength(128);
    const box = shipBounds(Object.fromEntries(car.map((p, i) => [i, p])), 0.72);
    const [w, h, l] = [0, 1, 2].map((i) => box.max[i] - box.min[i]);
    expect(box.min[1]).toBeCloseTo(0, 2);
    expect(l).toBeCloseTo(2.2, 1);
    expect(w).toBeCloseTo(1.0, 1);
    expect(h).toBeCloseTo(0.7, 1);
    // The nose (+z) sits lower than the rear: the wedge.
    const top = (front: boolean) =>
      Math.max(
        ...car.filter((p) => (front ? p.z > 0.7 : p.z < -0.7)).map((p) => p.y),
      );
    expect(top(true)).toBeLessThan(top(false));
  });

  it("is in the morph library at 128 voxels beside the spacecraft and mecha", () => {
    const recipe = createMorphComposition({
      assetIds: ["car", "mecha", "spacecraft"],
      count: 128,
      style: "direct",
    });
    expect(recipe.motion!.stateKeys.map((k) => k.label)).toEqual([
      "Car",
      "Mecha",
      "Spacecraft",
    ]);
    for (const key of recipe.motion!.stateKeys)
      expect(Object.keys(key.objects)).toHaveLength(128);
  });
});

describe("car-mecha", () => {
  it.each([97, 193, 241])(
    "builds within the recipe bound at %i frames",
    (n) => {
      const { recipe, metadata } = createStudy(
        "car-mecha",
        bands(n, 0.5),
        dims(n),
      );
      expect(serializeRecipe(recipe).bytes).toBeLessThanOrEqual(64_000);
      expect(metadata.design).toBeTruthy();
      expect(recipe.motion!.stateKeys.map((k) => k.label)).toEqual([
        "Car",
        "Mecha",
      ]);
    },
  );

  it("is the car in silence and the mecha at full bass, whatever the frame", () => {
    const [car, mecha] = study(0).motion!.stateKeys;
    expect(Object.keys(car.objects)).toEqual(Object.keys(mecha.objects));
    expect(Object.keys(car.objects)).toHaveLength(128);
    for (const frame of [0, 40, 96])
      for (const [low, key] of [
        [0, car],
        [1, mecha],
      ] as const) {
        const got = voxels(study(low), frame);
        for (const [id, part] of Object.entries(key.objects)) {
          expect(got[id].x).toBeCloseTo(part.x, 6);
          expect(got[id].y).toBeCloseTo(part.y, 6);
          expect(got[id].z).toBeCloseTo(part.z, 6);
          expect(got[id].color).toBe(CAR_COLOURS[key.label]);
        }
      }
  });

  it("keeps the preset forms: each state is its layout, only moved", () => {
    const preset = createMotionPreset("car-mecha").motion!.stateKeys;
    for (const key of study(0).motion!.stateKeys) {
      const source = preset.find((s) => s.label === key.label)!;
      const ids = Object.keys(source.objects);
      const offset = (id: string) =>
        (["x", "y", "z"] as const).map(
          (f) => key.objects[id][f] - source.objects[id][f],
        );
      const first = offset(ids[0]);
      for (const id of ids) {
        offset(id).forEach((v, i) => expect(v).toBeCloseTo(first[i], 2));
        expect(key.objects[id].scale).toBeCloseTo(source.objects[id].scale, 3);
      }
    }
  });

  it("is a held front three-quarter view, both forms on the floor inside the frame", () => {
    const recipe = study(0);
    expect(recipe.avatar).toBe(false);
    expect(
      recipe.motion!.mappings.map((m) => [m.property, m.source, m.amount]),
    ).toEqual([["twistY", "mid", 0.2]]);
    expect(recipe.cameraMotion!.keys).toHaveLength(1);
    const cam = sceneCameraAt(recipe, 0)!;
    for (const frame of [17, 48, 96])
      expect(sceneCameraAt(recipe, frame)).toEqual(cam);
    // In front of the nose (+z), round to one side, a little above.
    expect(cam.position[2]).toBeGreaterThan(cam.target[2]);
    expect(cam.position[0]).toBeGreaterThan(cam.target[0] + 1);
    expect(cam.position[1]).toBeGreaterThan(cam.target[1]);
    const distance = Math.hypot(
      ...cam.position.map((v, i) => v - cam.target[i]),
    );
    const frame = 2 * distance * Math.tan((cam.fov / 2) * (Math.PI / 180));
    const size = recipe.motion!.instances!.size;
    for (const [low, key] of [
      [0, "Car"],
      [1, "Mecha"],
    ] as const) {
      const scene = study(low);
      const box = shipBounds(voxels(scene, 40), size);
      const height = box.max[1] - box.min[1],
        width = box.max[0] - box.min[0];
      expect(box.min[1]).toBeCloseTo(0, 2);
      expect(height).toBeLessThan(frame * 0.65);
      expect(width).toBeLessThan(frame * (1024 / 576) * 0.8);
      if (key === "Mecha") expect(height / frame).toBeCloseTo(CAR_FILL, 1);
      else expect(width).toBeGreaterThan(height);
      // Projected at frame 0, the form sits inside the 1024 x 576 frame.
      const { car } = studyRegions("car-mecha", scene);
      expect(car.x).toBeGreaterThan(0);
      expect(car.y).toBeGreaterThan(0);
      expect(car.x + car.w).toBeLessThan(1024);
      expect(car.y + car.h).toBeLessThan(576);
    }
  });
});

describe("car-mecha on a smoothed, released band", () => {
  it("reads a narrow p75-to-p95 spread as swells: the car at its floor, the mecha on a peak", () => {
    // As Dimensions 40.125 after release 30 and smooth 5: p75 0.75, p95
    // 0.78, a 0.03 spread that ship-mecha's 0.05 guard leaves raw.
    const n = 97;
    const input = bands(n, 0);
    input.bandEnvelopes.low = Array.from({ length: n }, (_, i) =>
      i >= 50 && i <= 64 ? 0.78 : i % 2 ? 0.75 : 0.7,
    );
    const { recipe } = createStudy("car-mecha", input, dims(n));
    const [car, mecha] = recipe.motion!.stateKeys;
    const at = (frame: number) => voxels(recipe, frame)["voxel-000"];
    expect(at(0).y).toBeCloseTo(car.objects["voxel-000"].y, 6);
    expect(at(62).y).toBeCloseTo(mecha.objects["voxel-000"].y, 6);
  });
});
