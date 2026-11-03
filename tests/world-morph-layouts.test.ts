import { describe, expect, it } from "vitest";
import { Box3, Euler, Vector3 } from "three";
import type { SceneTransform } from "../src/world-builder/scene-state";
import { validTransform } from "../src/world-builder/scene-contract";
import {
  maskLayouts,
  palmGroveLayouts,
  spacecraftLayouts,
} from "../src/world-builder/motion-object-layouts";
import { fruitLayouts } from "../src/world-builder/motion-fruit-layouts";
import { mixSceneTransform } from "../src/world-builder/scene-transform";

function bounds(layout: SceneTransform[]) {
  const box = new Box3();
  for (const p of layout) {
    const rotation = new Euler(
      p.rotationX ?? 0,
      p.rotation ?? 0,
      p.rotationZ ?? 0,
    );
    for (const x of [-0.5, 0.5])
      for (const y of [-0.5, 0.5])
        for (const z of [-0.5, 0.5])
          box.expandByPoint(
            new Vector3(
              x * p.scale * (p.scaleX ?? 1),
              y * p.scale * (p.scaleY ?? 1),
              z * p.scale * (p.scaleZ ?? 1),
            )
              .applyEuler(rotation)
              .add(new Vector3(p.x, p.y, p.z)),
          );
  }
  return box.getSize(new Vector3());
}

describe("bounded authored object layouts", () => {
  for (const [name, create, count] of [
    ["spacecraft/mecha", spacecraftLayouts, 128],
    ["sculptural mask", maskLayouts, 96],
    ["palm grove", palmGroveLayouts, 96],
    ["fruit", () => fruitLayouts(96), 96],
    ["detailed fruit", () => fruitLayouts(192), 192],
  ] as const) {
    it(`${name} retains bounded parts across all three states and interpolation`, () => {
      const layouts = create();
      expect(layouts).toHaveLength(3);
      expect(layouts).toEqual(create());
      for (const layout of layouts) {
        expect(layout).toHaveLength(count);
        for (const p of layout) {
          expect(validTransform(p)).toBe(true);
          expect([p.x, p.y, p.z, p.scale].every(Number.isFinite)).toBe(true);
          expect(
            Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)),
          ).toBeLessThan(12);
          expect(p.scale).toBeGreaterThan(0);
        }
      }
      expect(layouts[0]).not.toEqual(layouts[1]);
      expect(layouts[1]).not.toEqual(layouts[2]);
      for (let state = 0; state < 2; state++)
        for (let index = 0; index < count; index++) {
          const mixed = mixSceneTransform(
            layouts[state][index],
            layouts[state + 1][index],
            0.5,
          );
          expect(validTransform(mixed)).toBe(true);
          expect(
            [mixed.x, mixed.y, mixed.z, mixed.scale].every(Number.isFinite),
          ).toBe(true);
        }
      layouts[0][0].x = 999;
      expect(create()[0][0].x).not.toBe(999);
    });
  }

  it("opens a flat spacecraft into a tall humanoid and then broad wings", () => {
    const [ship, robot, open] = spacecraftLayouts().map(bounds);
    expect(robot.y).toBeGreaterThan(ship.y * 2);
    expect(ship.z).toBeGreaterThan(robot.z * 2);
    expect(open.x).toBeGreaterThan(robot.x * 1.5);
  });

  it("grows a crown and opens the mask without adding parts", () => {
    const [mask, crown, open] = maskLayouts().map(bounds);
    expect(crown.y).toBeGreaterThan(mask.y);
    expect(open.x).toBeGreaterThan(mask.x * 1.3);
  });

  it("doubles fruit detail with smaller cells while preserving the silhouettes", () => {
    const low = fruitLayouts(96);
    const high = fruitLayouts(192);
    expect(high[0][0].scale / low[0][0].scale).toBeGreaterThan(0.78);
    expect(high[0][0].scale / low[0][0].scale).toBeLessThan(0.81);
    for (const layouts of [low, high]) {
      const [banana, papaya, apple] = layouts.map(bounds);
      expect(banana.x / banana.y).toBeGreaterThan(1.4);
      expect(papaya.y / papaya.x).toBeGreaterThan(1.5);
      expect(apple.x / apple.y).toBeGreaterThan(0.7);
      expect(apple.x / apple.y).toBeLessThan(1.3);
    }
    for (let state = 0; state < 3; state++) {
      const a = bounds(low[state]);
      const b = bounds(high[state]);
      for (const axis of ["x", "y", "z"] as const)
        expect(b[axis] / a[axis]).toBeGreaterThan(0.78);
      for (const axis of ["x", "y", "z"] as const)
        expect(b[axis] / a[axis]).toBeLessThan(1.22);
    }
    expect(() => fruitLayouts(384 as 192)).toThrow(/96 or 192/);
  });

  it("attaches every stem segment to the fruit at both detail levels", () => {
    for (const count of [96, 192] as const)
      for (const layout of fruitLayouts(count)) {
        const bodyCount = count - count / 48;
        const connected = layout.slice(0, bodyCount);
        for (const stem of layout.slice(bodyCount)) {
          const gap = Math.min(
            ...connected.map((p) =>
              Math.max(
                ...(["x", "y", "z"] as const).map((axis) => {
                  const scale =
                    axis === "x"
                      ? "scaleX"
                      : axis === "y"
                        ? "scaleY"
                        : "scaleZ";
                  return (
                    Math.abs(stem[axis] - p[axis]) -
                    (stem.scale * (stem[scale] ?? 1) +
                      p.scale * (p[scale] ?? 1)) /
                      2
                  );
                }),
              ),
            ),
          );
          expect(gap).toBeLessThanOrEqual(0.03);
          connected.push(stem);
        }
      }
  });
});
