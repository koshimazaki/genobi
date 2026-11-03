import { describe, expect, it } from "vitest";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import { createStudy } from "../scripts/experiments/recipes";

const dims = (frames: number) => ({ width: 1024, height: 576, frames });
const bands = (frames: number, low: () => number) => {
  const flat = Array.from({ length: frames }, () => 0.3);
  return {
    envelope: [...flat],
    bandEnvelopes: {
      sub: [...flat],
      low: Array.from({ length: frames }, low),
      mid: [...flat],
      high: [...flat],
    },
  };
};

describe("pyramid-inside-spin", () => {
  it.each([97, 193, 241])(
    "pyramid-inside-spin turns once, uniformly, clear of every wall at %i frames",
    (frames) => {
      const { recipe } = createStudy(
        "pyramid-inside-spin",
        bands(frames, () => 1),
        dims(frames),
      );
      const parts = evaluateScene(recipe, 0).objects.filter((o) =>
        o.id.startsWith("voxel-"),
      );
      const size = recipe.motion!.instances!.size;
      const last = frames - 1;
      let turned = 0,
        previous: number | undefined;
      const steps: number[] = [];
      for (let f = 0; f <= last; f++) {
        const cam = sceneCameraAt(recipe, f)!;
        const [px, py, pz] = cam.position,
          [tx, ty, tz] = cam.target;
        // Near the floor centre, about 10 degrees up, 85 degree lens.
        expect(Math.hypot(px, pz)).toBeLessThan(1);
        expect(py).toBeCloseTo(1.2, 6);
        const pitch = Math.atan2(ty - py, Math.hypot(tx - px, tz - pz));
        expect((pitch * 180) / Math.PI).toBeCloseTo(10, 0);
        expect(cam.fov).toBe(85);
        const heading = Math.atan2(tx - px, tz - pz);
        if (previous !== undefined) {
          let d = heading - previous;
          if (d > Math.PI) d -= 2 * Math.PI;
          if (d < -Math.PI) d += 2 * Math.PI;
          steps.push(d);
          turned += d;
        }
        previous = heading;
        // Full close (walls at 0.3): the lens keeps 4 m from every wall piece.
        for (const o of parts) {
          const h = [o.scaleX ?? 1, o.scaleY ?? 1, o.scaleZ ?? 1].map(
            (v) => (v * o.scale * size) / 2,
          );
          const gap = Math.hypot(
            Math.max(0, Math.abs(px - o.x) - h[0]),
            Math.max(0, Math.abs(py - o.y) - h[1]),
            Math.max(0, Math.abs(pz - o.z) - h[2]),
          );
          expect(gap).toBeGreaterThan(4);
        }
      }
      expect(Math.abs(turned)).toBeCloseTo(2 * Math.PI, 6);
      for (const d of steps) expect(d).toBeCloseTo(turned / last, 9);
      // The figure stays where pyramid-inside puts it.
      expect(recipe.avatarPose).toEqual({ x: 1.2, y: 0, z: -3.5, yaw: 0 });
    },
  );
});
