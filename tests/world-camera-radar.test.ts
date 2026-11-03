import { describe, expect, it } from "vitest";
import {
  cameraRadarBounds,
  projectRadarPose,
} from "../src/world-builder/camera-radar-bounds";

describe("life-size camera travel diagram", () => {
  it("keeps a100 metre descent visible instead of clipping to the old26 metre height", () => {
    const poses = [
      { x: 0, y: 98, z: 9.5 },
      { x: 0, y: 2.4, z: 3.6 },
    ];
    const bounds = cameraRadarBounds(poses);
    const points = poses.map((pose) =>
      projectRadarPose(pose, "side", 300, 132, bounds),
    );
    expect(points[0].y).toBeCloseTo(16);
    expect(points[1].y).toBeGreaterThan(100);
    points.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(14);
      expect(point.x).toBeLessThanOrEqual(286);
      expect(point.y).toBeGreaterThanOrEqual(16);
      expect(point.y).toBeLessThanOrEqual(112);
    });
  });

  it("preserves distinct altitude and radial distances for underground and large lateral travel", () => {
    const poses = [
      { x: 150, y: 120, z: -200 },
      { x: 0, y: -30, z: 100 },
      { x: 0, y: 0, z: 0 },
    ];
    const bounds = cameraRadarBounds(poses);
    expect(bounds).toEqual({ horizontal: 250, minHeight: -30, maxHeight: 120 });
    const below = projectRadarPose(poses[1], "side", 300, 132, bounds);
    const ground = projectRadarPose(poses[2], "side", 300, 132, bounds);
    expect(below.y).toBeGreaterThan(ground.y);
    for (const pose of poses) {
      const point = projectRadarPose(pose, "top", 300, 132, bounds);
      expect(Math.hypot(point.x - 150, point.y - 66)).toBeLessThanOrEqual(52);
    }
  });
});
