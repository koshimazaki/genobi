import { describe, expect, it } from "vitest";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import { createStudy } from "../scripts/experiments/recipes";
import { serializeRecipe } from "../scripts/experiments/contracts";
import { MIN_CUE_GAP } from "../scripts/experiments/recipes-fruit";
import { MECHA_GLOW } from "../scripts/experiments/recipes-fruit-mecha";

const dims = (frames: number) => ({ width: 1024, height: 576, frames });
const bands = (frames: number, low: (i: number) => number, rest = 0.3) => {
  const flat = Array.from({ length: frames }, () => rest);
  return {
    envelope: [...flat],
    bandEnvelopes: {
      sub: [...flat],
      low: Array.from({ length: frames }, (_, i) => low(i)),
      mid: [...flat],
      high: [...flat],
    },
  };
};
const peaks = new Map([
  [20, 0.9],
  [30, 1],
  [70, 0.95],
  [100, 0.7],
  [150, 0.8],
  [160, 0.85],
]);
const peaky = (frames: number) => bands(frames, (i) => peaks.get(i) ?? 0.1);
const side = (id: string) => (Number(id.slice(6)) < 96 ? "left" : "right");
/** The dancer's torso and bent arms at shoulder height, either side of x 0. */
const FIGURE_HALF_WIDTH = 0.4;

describe("fruit-mecha", () => {
  it.each([97, 193, 241])(
    "builds within the recipe bound at %i frames",
    (frames) => {
      const { recipe, metadata } = createStudy(
        "fruit-mecha",
        peaky(frames),
        dims(frames),
      );
      expect(serializeRecipe(recipe).bytes).toBeLessThanOrEqual(64_000);
      expect(metadata.sourcePreset).toBe("fruit-morph-fine");
      expect(recipe.motion!.instances!.count).toBe(192);
    },
  );

  it("opens on a banana on the left and an apple on the right", () => {
    const { recipe } = createStudy("fruit-mecha", peaky(193), dims(193));
    const first = recipe.motion!.stateKeys[0];
    expect(first.label).toBe("Banana | Apple");
    expect(first.frame).toBe(0);
    const ids = Object.keys(first.objects);
    expect(ids).toHaveLength(192);
    for (const [id, part] of Object.entries(first.objects))
      expect(Math.sign(part.x)).toBe(side(id) === "left" ? -1 : 1);
  });

  it.each([97, 193, 241])(
    "changes both fruits on every cue and keeps them different at %i frames",
    (frames) => {
      const { recipe, metadata } = createStudy(
        "fruit-mecha",
        peaky(frames),
        dims(frames),
      );
      expect(metadata.cues.length).toBeGreaterThan(0);
      for (let i = 1; i < metadata.cues.length; i++)
        expect(
          metadata.cues[i].frame - metadata.cues[i - 1].frame,
        ).toBeGreaterThanOrEqual(MIN_CUE_GAP);
      const keys = recipe.motion!.stateKeys;
      const pairs = keys.map((k) => k.label.split(" | "));
      for (const [l, r] of pairs) expect(l).not.toBe(r);
      metadata.cues.forEach((_, i) => {
        const before = pairs[i * 2 + 1],
          after = pairs[i * 2 + 2];
        expect(after[0]).not.toBe(before[0]);
        expect(after[1]).not.toBe(before[1]);
      });
      const order = ["Banana", "Papaya", "Apple"];
      expect(pairs.filter((_, i) => i % 2 === 0).map((p) => p[0])).toEqual(
        Array.from(
          { length: metadata.cues.length + 1 },
          (_, i) => order[i % 3],
        ),
      );
    },
  );

  it("holds a level front view with the dancer filling most of the frame", () => {
    const { recipe } = createStudy("fruit-mecha", peaky(97), dims(97));
    expect(recipe.motion!.rotation).toBeUndefined();
    expect(recipe.motion!.mappings.map((m) => m.property)).toEqual(["scale"]);
    expect(recipe.avatarMotion).toBe("dance");
    expect(recipe.avatarPose).toEqual({ x: 0, y: 0, z: 0, yaw: 0 });
    const cam = sceneCameraAt(recipe, 0)!;
    for (const frame of [17, 48, 96])
      expect(sceneCameraAt(recipe, frame)).toEqual(cam);
    expect(cam.position[0]).toBe(0);
    expect(cam.position[1]).toBeGreaterThanOrEqual(1);
    expect(cam.position[1]).toBeLessThanOrEqual(1.2);
    const distance = Math.hypot(
      ...cam.position.map((v, i) => v - cam.target[i]),
    );
    const frame = 2 * distance * Math.tan((cam.fov / 2) * (Math.PI / 180));
    const share = 1.8 / frame;
    expect(share).toBeGreaterThan(0.75);
    expect(share).toBeLessThan(0.95);
    // Feet just inside the bottom edge.
    const bottom = cam.target[1] - frame / 2;
    expect(bottom).toBeLessThan(0);
    expect(bottom).toBeGreaterThan(-0.2);
  });

  it("keeps both fruits clear of the dancer and inside the frame at full bass", () => {
    for (const level of [0, 1]) {
      const { recipe } = createStudy(
        "fruit-mecha",
        bands(97, () => level),
        dims(97),
      );
      const cam = sceneCameraAt(recipe, 0)!;
      const distance = Math.hypot(
        ...cam.position.map((v, i) => v - cam.target[i]),
      );
      const halfWidth =
        distance * Math.tan((cam.fov / 2) * (Math.PI / 180)) * (1024 / 576);
      const parts = evaluateScene(recipe, 40).objects;
      for (const s of ["left", "right"]) {
        const fruit = parts.filter((p) => side(p.id) === s);
        const half = (p: (typeof fruit)[number]) =>
          (p.scale * (p.scaleX ?? 1)) / 2;
        const inner = Math.min(...fruit.map((p) => Math.abs(p.x) - half(p)));
        const outer = Math.max(...fruit.map((p) => Math.abs(p.x) + half(p)));
        expect(inner - FIGURE_HALF_WIDTH).toBeGreaterThan(0.3);
        expect(outer).toBeLessThan(halfWidth);
        const xs = fruit.map((p) => p.x);
        const across = Math.max(...xs) - Math.min(...xs);
        expect(across).toBeGreaterThan(0.3);
      }
    }
  });

  it("glows the fruit on the bass through the primitives route", () => {
    const { recipe } = createStudy("fruit-mecha", peaky(97), dims(97));
    expect(recipe.audioRoutes).toEqual([
      expect.objectContaining({
        source: "low",
        target: "primitives",
        property: "glow",
        amount: MECHA_GLOW,
        enabled: true,
      }),
    ]);
    expect(evaluateScene(recipe, 30).mods.get("primitives")?.glow).toBeCloseTo(
      MECHA_GLOW,
      3,
    );
  });
});
