import { describe, expect, it } from "vitest";
import { avatarPoseAt } from "../src/world-builder/avatar-path";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { validateRecipe } from "../src/world-builder/recipe";
import { reconcileDuration } from "../src/world-builder/take-duration";
import { createStoryPreset } from "../src/world-builder/story-presets";
import { motionAt, motionStarts } from "../src/world-builder/motion";

function journey() {
  return validateRecipe({
    ...createMotionPreset("city-to-loft"),
    avatar: true,
    avatarPose: { x: 0, y: 100, z: 0, yaw: 0 },
    avatarPath: [
      { frame: 48, pose: { x: 1, y: 75, z: -2, yaw: 0.1 } },
      { frame: 96, pose: { x: 2, y: 40, z: -3, yaw: 0.2 } },
      { frame: 192, pose: { x: 2, y: 0, z: -3, yaw: 0.2 }, ease: "fall" },
    ],
    avatarMotion: [
      { clip: "fall", seconds: 4 },
      { clip: "land", seconds: 1 },
      { clip: "dance", seconds: 73 / 24 },
    ],
  });
}

describe("character travel and motion retiming", () => {
  it("keeps the fall, camera and scene endpoints aligned when extending the take to 30 seconds", () => {
    const original = journey(),
      before = structuredClone(original);
    const resized = validateRecipe(
      reconcileDuration(original, { ...original, seconds: 30 }),
    );
    expect(resized.frames).toBe(721);
    expect(resized.avatarPath!.map((key) => key.frame)).toEqual([
      180, 360, 720,
    ]);
    expect(resized.motion!.stateKeys.map((key) => key.frame)).toEqual([
      0, 360, 720,
    ]);
    expect(resized.cameraMotion!.keys.map((key) => key.frame)).toEqual([
      0, 360, 720,
    ]);
    expect(avatarPoseAt(resized, 360)).toEqual(avatarPoseAt(original, 96));
    expect(avatarPoseAt(resized, 720)).toEqual(avatarPoseAt(original, 192));
    if (
      !Array.isArray(resized.avatarMotion) ||
      !Array.isArray(original.avatarMotion)
    )
      throw new Error("Expected authored character steps.");
    resized.avatarMotion.forEach((step, i) => {
      expect(step.clip).toBe(
        (original.avatarMotion as typeof resized.avatarMotion)[i].clip,
      );
      expect(step.seconds).toBeCloseTo(
        ((original.avatarMotion as typeof resized.avatarMotion)[i].seconds *
          720) /
          192,
        12,
      );
    });
    expect(
      resized.avatarMotion.reduce((sum, step) => sum + step.seconds, 0),
    ).toBeCloseTo(((193 / 24) * 720) / 192, 12);
    expect(original).toEqual(before);
  });

  it("retimes only the independently unchanged character fields", () => {
    const original = journey();
    const path = [{ frame: 60, pose: { x: 2, y: 0, z: 0, yaw: 0 } }];
    const suppliedPath = validateRecipe(
      reconcileDuration(original, {
        ...original,
        seconds: 4,
        avatarPath: path,
      }),
    );
    expect(suppliedPath.avatarPath).toEqual(path);
    expect(suppliedPath.avatarMotion).not.toEqual(original.avatarMotion);
    const motion = [{ clip: "dance", seconds: 2 }];
    const suppliedMotion = validateRecipe(
      reconcileDuration(original, {
        ...original,
        seconds: 4,
        avatarMotion: motion,
      }),
    );
    expect(suppliedMotion.avatarMotion).toEqual(motion);
    expect(suppliedMotion.avatarPath!.map((key) => key.frame)).toEqual([
      24, 48, 96,
    ]);
    expect(
      validateRecipe(
        reconcileDuration(original, {
          ...original,
          seconds: 4,
          avatarMotion: "idle",
        }),
      ).avatarMotion,
    ).toBe("idle");
  });

  it("keeps frame zero reserved for the initial pose when short paths have rounding collisions", () => {
    const original = journey();
    original.avatarPath = [1, 2, 3, 192].map((frame) => ({
      frame,
      pose: { x: 0, y: 192 - frame, z: 0, yaw: 0 },
    }));
    original.avatarMotion = "fall";
    const resized = validateRecipe(
      reconcileDuration(original, { ...original, seconds: null, frames: 9 }),
    );
    expect(resized.avatarPath!.map((key) => key.frame)).toEqual([1, 2, 3, 8]);
    expect(avatarPoseAt(resized, 8).y).toBe(0);
    original.avatarPath = Array.from({ length: 16 }, (_, index) => ({
      frame: index + 1,
      pose: original.avatarPose,
    }));
    expect(() =>
      reconcileDuration(original, { ...original, seconds: null, frames: 9 }),
    ).toThrow(/at least one frame/);
  });

  it("preserves cropped longer paths without reserving shared retiming slots", () => {
    for (const lastFrame of [193, 288]) {
      const original = journey();
      original.avatarPath = [1, 2, 3, 4, 5, 6, 7, lastFrame].map((frame) => ({
        frame,
        pose: { x: 0, y: 100 * (1 - frame / lastFrame), z: 0, yaw: 0 },
      }));
      // Including these frozen keys in the shared map would exceed nine slots.
      const resized = validateRecipe(
        reconcileDuration(original, { ...original, seconds: 0.375 }),
      );
      expect(resized.frames).toBe(9);
      expect(resized.avatarPath).toEqual(original.avatarPath);
      expect(avatarPoseAt(resized, 8)).toEqual(avatarPoseAt(original, 8));
      expect(resized.motion!.stateKeys.map((key) => key.frame)).toEqual([
        0, 4, 8,
      ]);
      expect(resized.cameraMotion!.keys.map((key) => key.frame)).toEqual([
        0, 4, 8,
      ]);
    }
  });

  it.each([0.375, 1, 4, 16, 30])(
    "lands on the floor on the exact landing-clip frame at %s seconds",
    (seconds) => {
      const source = createStoryPreset("endless-descent");
      const recipe = validateRecipe(
        reconcileDuration(source, { ...source, seconds }),
      );
      if (!Array.isArray(recipe.avatarMotion))
        throw new Error("Expected a landing sequence.");
      const index = recipe.avatarMotion.findIndex(
        (step) => step.clip === "land",
      );
      const landing = motionStarts(recipe.avatarMotion, recipe.fps)[index];
      const floorKey = recipe.avatarPath!.find((key) => key.pose.y === 0)!;
      expect(landing).toBe(floorKey.frame);
      expect(avatarPoseAt(recipe, landing).y).toBe(0);
      expect(avatarPoseAt(recipe, landing - 1).y).toBeGreaterThan(0);
      expect(motionAt(recipe.avatarMotion, landing, recipe.fps).clip).toBe(
        "land",
      );
      expect(motionAt(recipe.avatarMotion, landing - 1, recipe.fps).clip).toBe(
        "jump-air",
      );
      expect(recipe.cameraMotion!.keys[4].frame).toBe(landing);
    },
  );

  it("preserves period-based clip durations for a looping take", () => {
    const source = journey();
    source.loop = true;
    const recipe = validateRecipe(
      reconcileDuration(source, { ...source, seconds: 30 }),
    );
    if (
      !Array.isArray(source.avatarMotion) ||
      !Array.isArray(recipe.avatarMotion)
    )
      throw new Error("Expected clip steps.");
    const steps = source.avatarMotion;
    recipe.avatarMotion.forEach((step, index) =>
      expect(step.seconds).toBeCloseTo((steps[index].seconds * 721) / 193, 12),
    );
  });

  it.each(["linear", "fall"] as const)(
    "preserves an off-take %s path at its original absolute times when extending",
    (ease) => {
      const source = validateRecipe({
        frames: 97,
        seconds: null,
        avatarPose: { x: 0, y: 100, z: 0, yaw: 0 },
        avatarPath: [
          { frame: 720, pose: { x: 50, y: 0, z: -20, yaw: 1 }, ease },
        ],
      });
      const recipe = validateRecipe(
        reconcileDuration(source, { ...source, frames: 193 }),
      );
      expect(recipe.avatarPath).toEqual(source.avatarPath);
      for (const frame of [0, 24, 48, 72, 96, 192]) {
        const before = avatarPoseAt(source, frame),
          after = avatarPoseAt(recipe, frame);
        for (const key of ["x", "y", "z", "yaw"] as const)
          expect(after[key]).toBeCloseTo(before[key], 10);
      }
      expect(avatarPoseAt(recipe, 192)).not.toEqual(avatarPoseAt(source, 96));
    },
  );

  it("bounds a held last clip and omits unreachable future steps when extending a valid short take", () => {
    const source = validateRecipe({
      frames: 97,
      seconds: null,
      avatarMotion: [{ clip: "idle", seconds: 30 }],
    });
    const recipe = validateRecipe(
      reconcileDuration(source, { ...source, seconds: 30 }),
    );
    expect(recipe.frames).toBe(721);
    if (!Array.isArray(recipe.avatarMotion))
      throw new Error("Expected clip steps.");
    expect(recipe.avatarMotion[0].seconds).toBeLessThanOrEqual(721 / 24);
    expect(motionAt(recipe.avatarMotion, 720, 24).clip).toBe("idle");
    const future = validateRecipe({
      ...source,
      avatarMotion: [
        { clip: "idle", seconds: 30 },
        { clip: "dance", seconds: 2 },
      ],
    });
    const retimed = validateRecipe(
      reconcileDuration(future, { ...future, seconds: 30 }),
    );
    expect(retimed.avatarMotion).toEqual(recipe.avatarMotion);
    expect(motionAt(retimed.avatarMotion, 720, 24).clip).toBe("idle");
  });
});
