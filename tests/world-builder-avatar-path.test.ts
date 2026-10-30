import { describe, expect, it } from "vitest";
import {
  cameraAt,
  cameraTargetAt,
  presetRecipe,
  validateRecipe,
} from "../src/world-builder/recipe";
import { avatarPoseAt, trackOffset } from "../src/world-builder/avatar-path";
import { shotPatch } from "../src/world-builder/camera-shots";
import { findPreset } from "../src/world-builder/world-presets";

const start = { x: 0, y: 38, z: -1, yaw: 0, pitch: Math.PI / 2 };
const end = { x: 0, y: 0, z: 3, yaw: 0, pitch: Math.PI / 2 };
const falling = (extra = {}) =>
  validateRecipe({
    avatar: true,
    frames: 193,
    avatarPose: start,
    avatarPath: [{ frame: 192, pose: end, ease: "fall" }],
    ...extra,
  });

describe("World Builder avatar path", () => {
  it("leaves a recipe without a path unchanged and static", () => {
    const r = validateRecipe(presetRecipe("Cathedral"));
    expect(r).not.toHaveProperty("avatarPath");
    expect(avatarPoseAt(r, 0)).toBe(r.avatarPose);
    expect(avatarPoseAt(r, 96)).toBe(r.avatarPose);
    expect(cameraTargetAt(r, 96)).toEqual([r.targetX, r.targetY, r.targetZ]);
  });

  it("interpolates by frame index, easing the height in like gravity", () => {
    const r = falling();
    expect(avatarPoseAt(r, 0)).toEqual(start);
    // Half the frames, a quarter of the drop; across the floor stays linear.
    const mid = avatarPoseAt(r, 96);
    expect(mid.y).toBeCloseTo(38 - 38 * 0.25);
    expect(mid.z).toBeCloseTo(1);
    expect(mid.pitch).toBeCloseTo(Math.PI / 2);
    expect(avatarPoseAt(r, 192)).toEqual(end);
    // Held after the last key, and the same answer every time it is asked.
    expect(avatarPoseAt(r, 240)).toEqual(end);
    expect(avatarPoseAt(r, 57)).toEqual(avatarPoseAt(falling(), 57));
    const linear = falling({
      avatarPath: [{ frame: 192, pose: end, ease: "linear" }],
    });
    expect(avatarPoseAt(linear, 96).y).toBeCloseTo(19);
  });

  it("walks several keys in order and drops zero angles", () => {
    const r = validateRecipe({
      avatarPose: { x: 0, y: 0, z: 0, yaw: 0 },
      avatarPath: [
        { frame: 10, pose: { x: 1, y: 0, z: 0, yaw: 0, pitch: 1 } },
        { frame: 20, pose: { x: 1, y: 0, z: 0, yaw: 0 } },
      ],
    });
    expect(avatarPoseAt(r, 5)).toEqual({
      x: 0.5,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0.5,
    });
    expect(avatarPoseAt(r, 20)).toEqual({ x: 1, y: 0, z: 0, yaw: 0 });
  });

  it("rejects bad keys", () => {
    for (const avatarPath of [
      [],
      [{ frame: 0, pose: end }],
      [{ frame: 241, pose: end }],
      [{ frame: 1.5, pose: end }],
      [
        { frame: 20, pose: end },
        { frame: 20, pose: end },
      ],
      [{ frame: 10, pose: { ...end, y: 41 } }],
      [{ frame: 10, pose: end, ease: "bounce" }],
      [{ frame: 10, pose: end, speed: 2 }],
      Array.from({ length: 17 }, (_, i) => ({ frame: i + 1, pose: end })),
      "fall",
    ])
      expect(() => validateRecipe({ avatarPath })).toThrow(/avatar/i);
  });

  it("moves a tracking shot's camera with the character, not a custom one", () => {
    const tracked = falling({ cameraShot: "skydive", targetY: 34 });
    expect(trackOffset(tracked, 192)).toEqual([0, -38, 4]);
    const [, y0] = cameraAt(tracked, 0);
    const [, y1] = cameraAt(tracked, 192);
    expect(y0 - y1).toBeCloseTo(38);
    expect(cameraTargetAt(tracked, 192)[1]).toBeCloseTo(34 - 38);
    const custom = falling({ cameraShot: "custom", targetY: 1, orbit: 0 });
    expect(trackOffset(custom, 192)).toEqual([0, 0, 0]);
    expect(cameraAt(custom, 192)).toEqual(cameraAt(custom, 0));
  });

  it("frames the skydive just above and behind, aimed down past the head", () => {
    const r = falling();
    const p = shotPatch("skydive", r, [start.x, start.y, start.z]);
    const camera = cameraAt(validateRecipe({ ...r, ...p }), 0);
    expect(camera[1] - start.y).toBeCloseTo(3);
    expect(camera[2] - start.z).toBeCloseTo(-2);
    expect(p.targetY).toBeCloseTo(34);
    expect(p.targetZ).toBeCloseTo(1.5);
  });

  it("ships the skydive preset as a valid 8 s descent", () => {
    const r = findPreset("Skydive · through the rooms", []).recipe;
    expect(r).toMatchObject({ width: 1024, height: 576, frames: 193 });
    expect(r.cameraShot).toBe("skydive");
    expect(avatarPoseAt(r, 0).y).toBe(38);
    expect(avatarPoseAt(r, 192).y).toBeCloseTo(0.1);
    expect(findPreset("skydive-cathedral", []).recipe).toEqual(r);
  });
});
