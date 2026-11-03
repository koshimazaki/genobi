import { describe, expect, it } from "vitest";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { createStudy } from "../scripts/experiments/recipes";
import { serializeRecipe } from "../scripts/experiments/contracts";
import {
  SHIP_COLOURS,
  SHIP_HOVER,
  bassSwells,
  shipBounds,
} from "../scripts/experiments/recipes-ship-mecha";

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
  createStudy("ship-mecha", bands(frames, low), dims(frames)).recipe;
const voxels = (recipe: ReturnType<typeof study>, frame: number) =>
  Object.fromEntries(
    evaluateScene(recipe, frame)
      .objects.filter((o) => o.id.startsWith("voxel-"))
      .map((o) => [o.id, o]),
  );

describe("ship-mecha", () => {
  it.each([97, 193, 241])(
    "builds within the recipe bound at %i frames",
    (n) => {
      const { recipe, metadata } = createStudy(
        "ship-mecha",
        bands(n, 0.5),
        dims(n),
      );
      expect(serializeRecipe(recipe).bytes).toBeLessThanOrEqual(64_000);
      expect(metadata.design).toBeTruthy();
      expect(recipe.motion!.stateKeys.map((k) => k.label)).toEqual([
        "Spacecraft",
        "Mecha",
      ]);
    },
  );

  it("is the spacecraft in silence and the mecha at full bass, whatever the frame", () => {
    const [ship, mecha] = study(0).motion!.stateKeys;
    expect(Object.keys(ship.objects)).toEqual(Object.keys(mecha.objects));
    expect(Object.keys(ship.objects)).toHaveLength(128);
    for (const frame of [0, 40, 96]) {
      for (const [low, key] of [
        [0, ship],
        [1, mecha],
      ] as const) {
        const got = voxels(study(low), frame);
        for (const [id, part] of Object.entries(key.objects)) {
          expect(got[id].x).toBeCloseTo(part.x, 6);
          expect(got[id].y).toBeCloseTo(part.y, 6);
          expect(got[id].z).toBeCloseTo(part.z, 6);
          expect(got[id].color).toBe(SHIP_COLOURS[key.label]);
        }
      }
    }
  });

  it("keeps the catalogue forms: each state is its preset layout, only moved", () => {
    const preset = createMotionPreset("spacecraft-mecha").motion!.stateKeys;
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

  it("is a held front view, the object hovering inside the frame at rest and at full bass", () => {
    const recipe = study(0);
    expect(recipe.avatar).toBe(false);
    expect(
      recipe.motion!.mappings.map((m) => [m.property, m.source, m.amount]),
    ).toEqual([["twistY", "mid", 0.2]]);
    expect(recipe.cameraMotion!.keys).toHaveLength(1);
    const cam = sceneCameraAt(recipe, 0)!;
    for (const frame of [17, 48, 96])
      expect(sceneCameraAt(recipe, frame)).toEqual(cam);
    expect(cam.position[0]).toBeCloseTo(cam.target[0], 6);
    expect(cam.position[2]).toBeGreaterThan(cam.target[2]);
    expect(cam.position[1]).toBeGreaterThan(cam.target[1]);
    const distance = Math.hypot(
      ...cam.position.map((v, i) => v - cam.target[i]),
    );
    const frame = 2 * distance * Math.tan((cam.fov / 2) * (Math.PI / 180));
    const size = recipe.motion!.instances!.size;
    for (const [low, key] of [
      [0, "Spacecraft"],
      [1, "Mecha"],
    ] as const) {
      const box = shipBounds(voxels(study(low), 40), size);
      const height = box.max[1] - box.min[1],
        width = box.max[0] - box.min[0];
      expect(box.min[1]).toBeGreaterThanOrEqual(SHIP_HOVER - 0.01);
      expect(height).toBeLessThan(frame * 0.65);
      expect(width).toBeLessThan(frame * (1024 / 576) * 0.8);
      // Centred on the view's line of sight.
      expect((box.max[0] + box.min[0]) / 2).toBeCloseTo(cam.target[0], 1);
      expect((box.max[1] + box.min[1]) / 2).toBeCloseTo(cam.target[1], 1);
      if (key === "Mecha") expect(height / frame).toBeCloseTo(0.6, 1);
    }
  });

  it("morphs on swells above the take's own bass floor, not on a loud floor", () => {
    expect(bassSwells([0, 0, 0]).low).toEqual([0, 0, 0]);
    expect(bassSwells([1, 1, 1]).low).toEqual([1, 1, 1]);
    // A loud take that never drops below 0.55: its usual level is the spacecraft.
    const n = 97;
    const low = Array.from({ length: n }, (_, i) =>
      i >= 60 && i <= 65 ? 0.85 : i % 2 ? 0.55 : 0.7,
    );
    const input = bands(n, 0);
    input.bandEnvelopes.low = low;
    const { recipe } = createStudy("ship-mecha", input, dims(n));
    recipe.motion!.mappings = [];
    const [ship, mecha] = recipe.motion!.stateKeys;
    const at = (frame: number) => voxels(recipe, frame)["voxel-000"];
    expect(at(0).x).toBeCloseTo(ship.objects["voxel-000"].x, 6);
    expect(at(1).x).toBeCloseTo(ship.objects["voxel-000"].x, 6);
    expect(at(60).x).toBeCloseTo(mecha.objects["voxel-000"].x, 6);
    // Held for a latent stride after the hit, then fading back, never early.
    expect(at(73).x).toBeCloseTo(mecha.objects["voxel-000"].x, 6);
    expect(at(59).x).toBeCloseTo(ship.objects["voxel-000"].x, 6);
    expect(at(90).x).toBeCloseTo(ship.objects["voxel-000"].x, 6);
  });
});
