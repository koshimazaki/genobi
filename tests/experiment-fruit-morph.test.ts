import { describe, expect, it } from "vitest";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import { createStudy } from "../scripts/experiments/recipes";
import {
  FRUIT_COLOURS,
  FRUIT_MORPHS,
  type FruitMorph,
} from "../scripts/experiments/recipes-fruit";
import { serializeRecipe } from "../scripts/experiments/contracts";

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
const STUDIES = Object.keys(FRUIT_MORPHS) as FruitMorph[];

describe.each(STUDIES)("%s", (name) => {
  const study = (low: number, frames = 97) =>
    createStudy(name, bands(frames, low), dims(frames)).recipe;
  /** The morph alone: the pulse and twist mappings switched off. */
  const morphed = (low: number, frame = 40) => {
    const recipe = study(low);
    recipe.motion!.mappings = [];
    return evaluateScene(recipe, frame).objects.filter((o) =>
      o.id.startsWith("voxel-"),
    );
  };

  it.each([97, 193, 241])(
    "builds within the recipe bound at %i frames",
    (n) => {
      const { recipe, metadata } = createStudy(
        "fruit-apple-banana",
        bands(n, 0.5),
        dims(n),
      );
      expect(serializeRecipe(recipe).bytes).toBeLessThanOrEqual(64_000);
      expect(metadata.design).toBeTruthy();
      expect(recipe.motion!.stateKeys.map((k) => k.label)).toEqual([
        "Apple",
        "Banana",
      ]);
    },
  );

  it("is the rest fruit in silence and the peak fruit at full bass, whatever the frame", () => {
    const recipe = study(0);
    const [rest, peak] = recipe.motion!.stateKeys;
    for (const frame of [0, 40, 96]) {
      for (const o of morphed(0, frame)) {
        const a = rest.objects[o.id];
        expect(o.x).toBeCloseTo(a.x, 6);
        expect(o.y).toBeCloseTo(a.y, 6);
        expect(o.z).toBeCloseTo(a.z, 6);
      }
      for (const o of morphed(1, frame)) {
        const b = peak.objects[o.id];
        expect(o.x).toBeCloseTo(b.x, 6);
        expect(o.y).toBeCloseTo(b.y, 6);
        expect(o.z).toBeCloseTo(b.z, 6);
      }
    }
  });

  it("is part way between the two at middling bass", () => {
    const [rest, peak] = study(0).motion!.stateKeys;
    const parts = morphed(0.4);
    // 0.4 x 1.2 = 0.48 of the way, voxel by voxel.
    let moved = 0;
    for (const o of parts) {
      const a = rest.objects[o.id],
        b = peak.objects[o.id];
      expect(o.x).toBeCloseTo(a.x + (b.x - a.x) * 0.48, 3);
      expect(o.y).toBeCloseTo(a.y + (b.y - a.y) * 0.48, 3);
      if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > 0.1) moved++;
    }
    expect(moved).toBeGreaterThan(parts.length / 2);
  });

  it("still swells on the bass, seen from the front with the rest fruit half the frame", () => {
    const recipe = study(0);
    expect(
      recipe.motion!.mappings.map((m) => [m.property, m.source, m.amount]),
    ).toEqual([
      ["scale", "low", 0.3],
      ["twistY", "mid", 0.2],
    ]);
    expect(recipe.avatar).toBe(false);
    const parts = evaluateScene(recipe, 0).objects.filter((o) =>
      o.id.startsWith("voxel-"),
    );
    const size = recipe.motion!.instances!.size;
    const half = (o: (typeof parts)[number]) => (o.scale * size) / 2;
    const low = Math.min(...parts.map((o) => o.y - half(o)));
    expect(low).toBeGreaterThanOrEqual(-0.005);
    expect(low).toBeLessThan(0.05);
    const cam = sceneCameraAt(recipe, 0)!;
    // Front view: the camera sits on +z of the fruit, on its centre line.
    expect(cam.position[0]).toBeCloseTo(cam.target[0], 6);
    expect(cam.position[2]).toBeGreaterThan(cam.target[2]);
    const distance = Math.hypot(
      ...cam.position.map((v, i) => v - cam.target[i]),
    );
    const frame = 2 * distance * Math.tan((cam.fov / 2) * (Math.PI / 180));
    const height = Math.max(...parts.map((o) => o.y + half(o))) - low;
    const width =
      Math.max(...parts.map((o) => o.x + half(o))) -
      Math.min(...parts.map((o) => o.x - half(o)));
    const share = Math.max(height / frame, width / (frame * (1024 / 576)));
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.55);
    // The peak fruit, swollen at full bass, still fits the frame.
    const loud = evaluateScene(study(1), 0).objects.filter((o) =>
      o.id.startsWith("voxel-"),
    );
    const span = (f: "x" | "y") =>
      Math.max(...loud.map((o) => o[f] + half(o))) -
      Math.min(...loud.map((o) => o[f] - half(o)));
    expect(span("y")).toBeLessThan(frame);
    expect(span("x")).toBeLessThan(frame * (1024 / 576));
  });
});

describe("fruit colours in the guide", () => {
  it.each([
    "fruit-dance",
    "fruit-apple",
    "fruit-banana",
    "fruit-papaya",
  ] as const)(
    "%s colours every voxel of each baked key by its fruit",
    (name) => {
      const { recipe } = createStudy(name, bands(193, 0.5), dims(193));
      for (const key of recipe.motion!.stateKeys) {
        const colour = FRUIT_COLOURS[key.label];
        expect(colour).toBeTruthy();
        for (const part of Object.values(key.objects))
          expect(part.color).toBe(colour);
      }
    },
  );

  it.each([...STUDIES, "fruit-mecha-morph"] as const)(
    "%s flecks a quarter of the body with the other fruit's colour",
    (name) => {
      const { recipe } = createStudy(name, bands(193, 0.5), dims(193));
      const [rest, peak] = recipe.motion!.stateKeys;
      const ids = Object.keys(rest.objects);
      // The fruit a voxel belongs to in a key: one per side in the mecha.
      const own = (key: typeof rest, id: string) => {
        const labels = key.label.split(" | ");
        return FRUIT_COLOURS[
          labels[labels.length > 1 && Number(id.slice(6)) >= 96 ? 1 : 0]
        ];
      };
      let flecked = 0;
      for (const id of ids) {
        const a = rest.objects[id].color!,
          b = peak.objects[id].color!;
        expect(a).not.toBe(b);
        if (a !== own(rest, id)) {
          flecked++;
          // The inverse pair: rest carries the peak colour and vice versa.
          expect(a).toBe(own(peak, id));
          expect(b).toBe(own(rest, id));
        } else expect(b).toBe(own(peak, id));
        // Stem voxels never fleck.
        if (Number(id.slice(6)) % 96 >= 94) expect(a).toBe(own(rest, id));
      }
      expect(flecked / ids.length).toBeGreaterThan(0.15);
      expect(flecked / ids.length).toBeLessThan(0.35);
    },
  );

  it("blends each voxel's colour on its own path through the morph", () => {
    const voxel = (low: number) => {
      const { recipe } = createStudy(
        "fruit-apple-banana",
        bands(97, low),
        dims(97),
      );
      const [rest, peak] = recipe.motion!.stateKeys;
      return {
        colour: evaluateScene(recipe, 40).objects.find(
          (o) => o.id === "voxel-000",
        )!.color,
        rest: rest.objects["voxel-000"].color,
        peak: peak.objects["voxel-000"].color,
      };
    };
    expect(voxel(0).colour).toBe(voxel(0).rest);
    expect(voxel(1).colour).toBe(voxel(1).peak);
    const mid = voxel(0.4).colour;
    expect(mid).not.toBe(FRUIT_COLOURS.Apple);
    expect(mid).not.toBe(FRUIT_COLOURS.Banana);
  });
});
