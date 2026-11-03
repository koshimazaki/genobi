import { describe, expect, it } from "vitest";
import {
  explodeOffset,
  explodeOffsets,
  explodePlan,
} from "../shared/scene/explode";
import type { Vec3 } from "../shared/scene/types";
import { defaultRecipe, validateRecipe } from "../src/world-builder/recipe";
import { evaluateScene } from "../src/world-builder/evaluate-scene";

// A small stack: a core at the centre, a near part and a far part.
const parts: Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 3, 0],
  [-1, -3, 0],
];

describe("generic explode", () => {
  it("leaves the assembly in place at 0 and doubles every distance at 1", () => {
    for (const o of explodeOffsets(parts, 0)) expect(o).toEqual([0, 0, 0]);
    const plan = explodePlan(parts);
    expect(plan.centre).toEqual([0, 0, 0]);
    explodeOffsets(parts, 1).forEach((o, i) =>
      o.forEach((v, k) => expect(v).toBeCloseTo(parts[i][k], 9)),
    );
  });

  it("starts the outermost part first, so nothing crosses on the way out", () => {
    const plan = explodePlan(parts);
    const far = Math.hypot(...plan.parts[3].reach);
    expect(far).toBeGreaterThan(Math.hypot(...plan.parts[1].reach));
    expect(plan.parts[3].start).toBe(0);
    expect(plan.parts[1].start).toBeGreaterThan(plan.parts[2].start);
    // Early in the move only the outer parts have left.
    const early = explodeOffsets(parts, 0.15);
    expect(Math.hypot(...early[3])).toBeGreaterThan(0);
    expect(early[1]).toEqual([0, 0, 0]);
  });

  it("moves along one axis when asked, like layers lifted apart", () => {
    const out = explodeOffsets(parts, 1, { axis: [0, 2, 0], distance: 0.5 });
    expect(out[1]).toEqual([0, 0, 0]);
    expect(out[2][1]).toBeCloseTo(1.5);
    expect(out[2][0]).toBe(0);
  });

  it("is deterministic and refuses bad input", () => {
    expect(explodeOffsets(parts, 0.6)).toEqual(explodeOffsets(parts, 0.6));
    const plan = explodePlan(parts, { centre: [0, 0, 0] });
    expect(explodeOffset(plan, 9, 1)).toEqual([0, 0, 0]);
    expect(explodeOffset(plan, 1, Number.NaN)).toEqual([0, 0, 0]);
    expect(() => explodePlan([[0, Number.NaN, 0]])).toThrow(/finite/);
    expect(() => explodePlan(parts, { axis: [0, 0, 0] })).toThrow(/axis/);
    expect(() => explodePlan(parts, { window: 0 })).toThrow(/window/);
    expect(explodePlan([]).parts).toEqual([]);
  });
});

it("keeps evaluated shot objects aligned with the WebGL explode offsets", () => {
  const objects = defaultRecipe.objects.map((p, i) => ({
    ...p,
    x: i === 0 ? -2 : 2,
    y: 1,
    z: 0,
    spin: 0,
  }));
  const recipe = validateRecipe({
    objects,
    frames: 97,
    envelope: [0, 1, 0],
    bandEnvelopes: { low: [0, 1, 0], mid: [], high: [], sub: [] },
    audioRoutes: [
      {
        id: "explode-test",
        target: "primitives",
        property: "explode",
        source: "low",
        amount: 1,
        threshold: 0,
        lerp: 1,
      },
    ],
  });
  const plan = explodePlan(objects.map((p) => [p.x, p.y, p.z]));
  const initial = evaluateScene(recipe, 0).objects;
  const opened = evaluateScene(recipe, 1).objects;
  const closed = evaluateScene(recipe, 2).objects;
  objects.forEach((part, i) => {
    const shift = explodeOffset(plan, i, 1);
    expect(initial[i].x).toBeCloseTo(part.x);
    expect(opened[i].x).toBeCloseTo(part.x + shift[0]);
    expect(opened[i].y).toBeCloseTo(part.y + shift[1]);
    expect(opened[i].z).toBeCloseTo(part.z + shift[2]);
    expect(closed[i].x).toBeCloseTo(part.x);
  });
  expect(evaluateScene(recipe, 1).objects).toEqual(opened);
});
