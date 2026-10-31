import { describe, expect, it } from "vitest";
import {
  architectureLayouts,
  type ArchitectureDetail,
} from "../src/world-builder/motion-architecture-layouts";
import type { SceneTransform } from "../src/world-builder/scene-state";
import { validTransform } from "../src/world-builder/scene-contract";
import { mixSceneTransform } from "../src/world-builder/scene-transform";
import { createMotionPreset } from "../src/world-builder/motion-presets";

function occupied(layout: SceneTransform[], x: number, y: number, z: number) {
  return layout.some((part) =>
    (["x", "y", "z"] as const).every((axis, index) => {
      const scale = `scale${axis.toUpperCase()}` as
        "scaleX" | "scaleY" | "scaleZ";
      return (
        Math.abs([x, y, z][index] - part[axis]) <=
        (part.scale * (part[scale] ?? 1)) / 2 + 1e-8
      );
    }),
  );
}

const shellDimensions: Record<ArchitectureDetail, number[][]> = {
  // Width, depth, roof-center height, center X, center Z.
  64: [
    [4, 4, 6, 0, 0],
    [3, 5, 6, 0, 0],
  ],
  128: [
    [5, 6, 6, 0, 0],
    [4, 6, 6, 0, -1],
  ],
  256: [
    [7, 7, 6, -3, -3],
    [5, 9, 8, 0, -1],
  ],
};

describe("closed architecture family", () => {
  for (const count of [64, 128, 256] as const) {
    it(`${count} keeps stable bounded parts through the three authored forms`, () => {
      const layouts = architectureLayouts(count);
      expect(layouts).toEqual(architectureLayouts(count));
      expect(layouts).toHaveLength(3);
      for (const layout of layouts) {
        expect(layout).toHaveLength(count);
        expect(new Set(layout.map((part) => JSON.stringify(part))).size).toBe(
          count,
        );
        for (const part of layout) {
          expect(validTransform(part)).toBe(true);
          expect(
            Math.max(Math.abs(part.x), Math.abs(part.y), Math.abs(part.z)),
          ).toBeLessThan(40);
        }
      }
      for (let state = 0; state < 2; state++)
        for (let part = 0; part < count; part++)
          expect(
            validTransform(
              mixSceneTransform(
                layouts[state][part],
                layouts[state + 1][part],
                0.37,
              ),
            ),
          ).toBe(true);
      layouts[0][0].x = 999;
      expect(architectureLayouts(count)[0][0].x).not.toBe(999);
    });

    it(`${count} has complete floors and roofs over hollow interiors, with deliberate doors`, () => {
      const layouts = architectureLayouts(count);
      for (let state = 1; state <= 2; state++) {
        const layout = layouts[state];
        const [width, depth, roofY, centerX, centerZ] =
          shellDimensions[count][state - 1];
        // Quarter-cell offsets exercise seams, including the subdivided roofs.
        for (let x = -width + 0.5; x < width; x++)
          for (let z = -depth + 0.5; z < depth; z++) {
            expect(occupied(layout, x + centerX, 0, z + centerZ)).toBe(true);
            expect(occupied(layout, x + centerX, roofY, z + centerZ)).toBe(
              true,
            );
          }
        expect(occupied(layout, centerX, 2, centerZ)).toBe(false);
        expect(occupied(layout, centerX, 2, centerZ + depth - 1)).toBe(false);
        // Corners join the side and front walls, rather than freestanding posts.
        expect(
          occupied(layout, centerX + width - 1, 2, centerZ + depth - 1),
        ).toBe(true);
        expect(
          occupied(layout, centerX - width + 1, 2, centerZ - depth + 1),
        ).toBe(true);
      }
    });

    it(`${count} uses a dark grid overview and saves the exact same authored layouts`, () => {
      const id =
        count === 64 ? "voxel-architecture" : `voxel-architecture-${count}`;
      const recipe = createMotionPreset(id);
      expect(recipe.stageLook).toBe("dark-grid");
      expect(recipe.background).toBe("#080b12");
      expect(recipe.motion?.room).toBeUndefined();
      expect(recipe.motion?.instances?.count).toBe(count);
      const states = recipe.motion!.stateKeys;
      expect(states.map((key) => key.label)).toEqual([
        "Pyramid",
        "House · chamber",
        "Cathedral",
      ]);
      expect(states.map((key) => key.frame)).toEqual([0, 72, 144]);
      expect(states.map((key) => Object.values(key.objects))).toEqual(
        architectureLayouts(count),
      );
      expect(states.map((key) => Object.keys(key.objects))).toEqual(
        Array.from({ length: 3 }, () => Object.keys(states[0].objects)),
      );
    });
  }

  it("grows the same family while preserving a narrowing pyramid silhouette", () => {
    const dimensions = ([64, 128, 256] as const).map((count) => {
      const layout = architectureLayouts(count)[0];
      const levels = [...new Set(layout.map((part) => part.y))].sort(
        (a, b) => a - b,
      );
      const widths = levels.map((y) => {
        const layer = layout.filter((part) => part.y === y);
        return (
          Math.max(...layer.map((part) => part.x + part.scale / 2)) -
          Math.min(...layer.map((part) => part.x - part.scale / 2))
        );
      });
      widths
        .slice(1)
        .forEach((width, i) => expect(width).toBeLessThanOrEqual(widths[i]));
      return widths[0];
    });
    expect(dimensions).toEqual([10, 14, 18]);
    expect(() => architectureLayouts(96 as ArchitectureDetail)).toThrow(
      /64, 128 or 256/,
    );
  });
});
