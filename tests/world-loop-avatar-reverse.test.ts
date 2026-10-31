import { describe, expect, it } from "vitest";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import {
  composeSceneLoop,
  createSceneLoopBank,
  saveSceneLoopSlot,
} from "../src/world-builder/scene-loop";
import { reverseSceneTravel } from "../src/world-builder/scene-camera";
import { avatarPoseAt } from "../src/world-builder/avatar-path";

function characterLoop(returnToStart = true) {
  let bank = createSceneLoopBank();
  for (const [index, x] of [0, 4, -4].entries()) {
    const recipe = presetRecipe("Small room");
    recipe.avatar = true;
    recipe.avatarPose = {
      x,
      y: index,
      z: -index,
      yaw: index * 0.5,
      pitch: index * 0.1,
      roll: index * -0.1,
    };
    bank = saveSceneLoopSlot(bank, index as 0 | 1 | 2, recipe, 0);
  }
  return composeSceneLoop(bank, { durationSeconds: 8, returnToStart });
}

describe("Character paths when reversing scene travel", () => {
  it.each([true, false])(
    "reverses every character pose with the scene and camera (return to start: %s)",
    (returnToStart) => {
      const original = characterLoop(returnToStart);
      original.avatarPath![0].ease = "linear";
      const before = structuredClone(original);
      const reversed = validateRecipe({
        ...original,
        ...reverseSceneTravel(original),
      });
      const last = original.frames - 1;
      expect(reversed.avatarPose).toEqual(avatarPoseAt(original, last));
      expect(avatarPoseAt(reversed, last)).toEqual(original.avatarPose);
      expect(reversed.avatarPath!.map((key) => key.frame)).toEqual(
        reversed.motion!.stateKeys.slice(1).map((key) => key.frame),
      );
      expect(reversed.cameraMotion!.keys.map((key) => key.frame)).toEqual(
        reversed.motion!.stateKeys.map((key) => key.frame),
      );
      for (let frame = 0; frame <= last; frame++) {
        const pose = avatarPoseAt(reversed, frame);
        const expected = avatarPoseAt(original, last - frame);
        for (const axis of ["x", "y", "z", "yaw", "pitch", "roll"] as const)
          expect(pose[axis] ?? 0).toBeCloseTo(expected[axis] ?? 0, 12);
      }
      if (returnToStart)
        expect(avatarPoseAt(reversed, last)).toEqual(reversed.avatarPose);
      expect(original).toEqual(before);
    },
  );

  it("refuses fall easing before changing any scene, camera or character data", () => {
    const recipe = characterLoop();
    recipe.avatarPath![0].ease = "fall";
    const before = structuredClone(recipe);
    expect(() => reverseSceneTravel(recipe)).toThrow(
      "Use linear character movement before reversing travel",
    );
    expect(recipe).toEqual(before);
  });

  it.each([191, 200])(
    "refuses a character path ending at frame %i instead of the take end without mutation",
    (frame) => {
      const recipe = characterLoop();
      recipe.avatarPath!.at(-1)!.frame = frame;
      const valid = validateRecipe(recipe);
      const before = structuredClone(valid);
      expect(() => reverseSceneTravel(valid)).toThrow(
        "Move the final character key to the end of the take",
      );
      expect(valid).toEqual(before);
    },
  );
});
