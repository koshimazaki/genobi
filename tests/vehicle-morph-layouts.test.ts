import { describe, expect, it } from "vitest";
import {
  BIKE_SCALE,
  bikeLayout,
  bikeMechaLayouts,
} from "../src/world-builder/motion-bike-layout";
import { brawlerLayout } from "../src/world-builder/motion-brawler-layout";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import {
  createMorphComposition,
  MORPH_ASSETS,
} from "../src/world-builder/morph-asset-catalogue";
import { shipBounds } from "../scripts/experiments/recipes-ship-mecha";
import type { SceneTransform } from "../src/world-builder/scene-state";

const bounds = (parts: SceneTransform[]) => {
  const box = shipBounds(Object.fromEntries(parts.map((p, i) => [i, p])), 0.72);
  const [w, h, l] = [0, 1, 2].map((i) => box.max[i] - box.min[i]);
  return { box, w, h, l };
};

describe("the sports bike form", () => {
  it("is a long, narrow body of 128 parts on the floor", () => {
    const bike = bikeLayout();
    expect(bike).toHaveLength(128);
    const { box, w, h, l } = bounds(bike);
    expect(box.min[1]).toBeCloseTo(0, 1);
    expect(l).toBeGreaterThan(2.4 * BIKE_SCALE);
    expect(l).toBeGreaterThan(2 * h);
    expect(l).toBeGreaterThan(2 * w);
    expect(bike.every((p) => typeof p.color === "string")).toBe(true);
  });
});

describe("the brawler mecha form", () => {
  it("stands 128 parts tall on the floor, taller than it is deep", () => {
    const brawler = brawlerLayout();
    expect(brawler).toHaveLength(128);
    const { box, h, l } = bounds(brawler);
    expect(box.min[1]).toBeGreaterThan(-0.1);
    expect(box.min[1]).toBeLessThan(0.5);
    expect(h).toBeGreaterThan(4);
    expect(h).toBeGreaterThan(l);
  });
});

describe("bike-mecha", () => {
  it("keeps the same 128 parts from bike to brawler, across the take", () => {
    const layouts = bikeMechaLayouts();
    expect(layouts).toHaveLength(2);
    for (const layout of layouts) expect(layout).toHaveLength(128);
    const recipe = createMotionPreset("bike-mecha");
    const keys = recipe.motion!.stateKeys;
    expect(keys.map((k) => k.label)).toEqual(["Bike", "Brawler"]);
    expect(keys.map((k) => k.frame)).toEqual([0, recipe.frames - 1]);
    const ids = Object.keys(keys[0].objects).sort();
    expect(ids).toHaveLength(128);
    for (const key of keys)
      expect(Object.keys(key.objects).sort()).toEqual(ids);
  });

  it("lists the bike and brawler in the morph library and composes them", () => {
    const machines = MORPH_ASSETS.filter((a) => a.family === "Machines").map(
      (a) => a.id,
    );
    expect(machines).toEqual(
      expect.arrayContaining(["car", "bike", "brawler", "mecha"]),
    );
    // Three coloured states fit the 64 KB recipe budget at 64 blocks; at
    // 128 blocks two forms do.
    const three = createMorphComposition({
      assetIds: ["bike", "brawler", "car"],
      count: 64,
      style: "direct",
    });
    expect(three.motion!.stateKeys.map((k) => k.label)).toEqual([
      "Sports bike",
      "Brawler mecha",
      "Car",
    ]);
    // The car carries no colours of its own, so its parts take a neutral one.
    for (const key of three.motion!.stateKeys)
      for (const part of Object.values(key.objects))
        expect(typeof part.color).toBe("string");
    const two = createMorphComposition({
      assetIds: ["bike", "brawler"],
      count: 128,
      style: "twist",
    });
    for (const key of two.motion!.stateKeys)
      expect(Object.keys(key.objects)).toHaveLength(128);
  });
});

describe("vehicle morph intermediate guide frames", () => {
  it.each(["car-mecha", "bike-mecha"] as const)(
    "%s keeps all 128 blocks finite and visible across intermediate poses",
    (id) => {
      const recipe = createMotionPreset(id);
      const frames = [0, 18, 36, 54, 72, 90, 108, 126, recipe.frames - 1];
      const start = evaluateScene(recipe, 0, { audio: false }).objects;
      const ids = start.map((object) => object.id);
      expect(ids).toHaveLength(128);
      for (const frame of frames) {
        const objects = evaluateScene(recipe, frame, {
          audio: false,
        }).objects;
        expect(objects.map((object) => object.id)).toEqual(ids);
        for (const object of objects) {
          const measures = [
            object.x,
            object.y,
            object.z,
            object.scale,
            object.scaleX ?? 1,
            object.scaleY ?? 1,
            object.scaleZ ?? 1,
            object.rotation ?? 0,
            object.rotationX ?? 0,
            object.rotationZ ?? 0,
          ];
          expect(measures.every(Number.isFinite), `${id}/${frame}/${object.id}`).toBe(
            true,
          );
          expect(object.scale, `${id}/${frame}/${object.id}`).toBeGreaterThan(0);
        }
      }
    },
  );
});
