import { describe, expect, it } from "vitest";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import {
  composeSceneLoop,
  createSceneLoopBank,
  saveSceneLoopSlot,
} from "../src/world-builder/scene-loop";
import { reconcileDuration } from "../src/world-builder/take-duration";
import { avatarPoseAt } from "../src/world-builder/avatar-path";

function characterLoop() {
  const a = presetRecipe("Small room");
  a.avatar = true;
  a.avatarPose = { x: 0, y: 0, z: 0, yaw: 0 };
  const b = structuredClone(a);
  b.avatarPose.x = 4;
  let bank = createSceneLoopBank();
  bank = saveSceneLoopSlot(bank, 0, a, 0);
  bank = saveSceneLoopSlot(bank, 1, b, 0);
  return composeSceneLoop(bank, { durationSeconds: 8 });
}

describe("Character path timing in saved scene loops", () => {
  it("retimes character, geometry and camera together and returns to A after a duration change", () => {
    const loop = characterLoop();
    for (const frames of [9, 97, 385, 721]) {
      const next = validateRecipe(reconcileDuration(loop, { ...loop, frames }));
      const midpoint = (frames - 1) / 2;
      expect(next.avatarPath!.map((key) => key.frame)).toEqual([
        midpoint,
        frames - 1,
      ]);
      expect(next.motion!.stateKeys.map((key) => key.frame)).toEqual([
        0,
        midpoint,
        frames - 1,
      ]);
      expect(next.cameraMotion!.keys.map((key) => key.frame)).toEqual([
        0,
        midpoint,
        frames - 1,
      ]);
      expect(avatarPoseAt(next, midpoint).x).toBe(4);
      expect(avatarPoseAt(next, frames - 1)).toEqual(next.avatarPose);
      expect(loop.avatarPath!.map((key) => key.frame)).toEqual([96, 192]);
    }
  });

  it("retains explicitly edited character keys instead of interpreting them as a duration-only edit", () => {
    const loop = characterLoop();
    const avatarPath = loop.avatarPath!.map((key, index) => ({
      ...key,
      frame: index === 0 ? 24 : 96,
    }));
    const next = validateRecipe(
      reconcileDuration(loop, { ...loop, frames: 97, avatarPath }),
    );
    expect(next.avatarPath).toEqual(avatarPath);
  });

  it("preserves the implicit frame-zero pose and distinct positive keys when shortening", () => {
    const loop = characterLoop();
    const original = validateRecipe({
      ...loop,
      avatarPath: [
        { frame: 1, pose: { ...loop.avatarPose, y: 1 }, ease: "fall" },
        { frame: 2, pose: { ...loop.avatarPose, y: 2 } },
        { frame: 192, pose: loop.avatarPose },
      ],
    });
    const next = validateRecipe(
      reconcileDuration(original, { ...original, frames: 9 }),
    );
    expect(next.avatarPath!.map((key) => key.frame)).toEqual([1, 2, 8]);
    expect(next.avatarPath![0].ease).toBe("fall");
    expect(avatarPoseAt(next, 0)).toEqual(original.avatarPose);
  });

  it("keeps an intentionally cropped longer character move at its original times", () => {
    const loop = characterLoop();
    const cropped = validateRecipe({
      ...loop,
      frames: 97,
      seconds: 97 / 24,
      motion: undefined,
      cameraMotion: undefined,
    });
    const next = validateRecipe(
      reconcileDuration(cropped, { ...cropped, frames: 49 }),
    );
    expect(next.avatarPath).toEqual(loop.avatarPath);
  });
});
