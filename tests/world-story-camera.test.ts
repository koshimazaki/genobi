import { describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import {
  cameraAt,
  cameraFovAt,
  cameraTargetAt,
  validateRecipe,
} from "../src/world-builder/recipe";
import { createStoryPreset } from "../src/world-builder/story-presets";
import {
  descentFollowCameraKeys,
  getDescentView,
  withDescentView,
} from "../src/world-builder/story-camera";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { evaluateAcousticEnvironment } from "../src/world-builder/evaluate-acoustic-environment";
import { mannequinGuide } from "../src/world-builder/mannequin-guide";
import { resizeScene, sceneSizeBounds } from "../src/world-builder/scene-size";
import { reconcileDuration } from "../src/world-builder/take-duration";
import { scaledAxes } from "../src/world-builder/scene-contract";
import { shotCameraPatch } from "../src/world-builder/shot-camera-edit";

describe("Endless descent saved views", () => {
  it("opens as a 75 degree first-person descent, looking down the clear central route with no rendered head", () => {
    const recipe = createStoryPreset("endless-descent");
    expect(getDescentView(recipe)).toBe("first-person");
    expect(recipe.avatar).toBe(false);
    expect(recipe.fov).toBe(75);
    expect(recipe.cameraMotion!.keys.map((key) => key.target[1])).toEqual([
      40, 12, 4, 0, 0.55, 1.1,
    ]);
    let previousY = Infinity;
    for (let frame = 0; frame < recipe.frames; frame++) {
      const position = cameraAt(recipe, frame),
        target = cameraTargetAt(recipe, frame);
      expect(position[0]).toBe(0);
      expect(position[2]).toBe(0);
      expect(target[0]).toBe(0);
      if (frame <= 336) expect(target[2]).toBe(0);
      else expect(target[2]).toBeLessThan(0);
      expect(target[1]).toBeLessThan(position[1]);
      expect(position[1]).toBeLessThan(previousY);
      expect(cameraFovAt(recipe, frame)).toBe(75);
      expect(mannequinGuide(recipe, frame)).toEqual([]);
      const point = new Vector3(...position);
      for (const part of evaluateScene(recipe, frame).objects) {
        const transform = new Matrix4().compose(
          new Vector3(part.x, part.y, part.z),
          new Quaternion().setFromEuler(
            new Euler(
              part.rotationX ?? 0,
              part.rotation ?? 0,
              part.rotationZ ?? 0,
            ),
          ),
          new Vector3(...scaledAxes(part)),
        );
        const local = point.clone().applyMatrix4(transform.invert());
        expect(
          Math.abs(local.x) < 0.5 &&
            Math.abs(local.y) < 0.5 &&
            Math.abs(local.z) < 0.5,
          `${frame}/${part.id} camera obstruction`,
        ).toBe(false);
      }
      previousY = position[1];
    }
    expect(cameraTargetAt(recipe, 352)).toEqual([0, 0.55, -1.75]);
    expect(cameraTargetAt(recipe, 384)).toEqual([0, 1.1, -3.5]);
    const finalDirection = new Vector3(...cameraTargetAt(recipe, 384))
      .sub(new Vector3(...cameraAt(recipe, 384)))
      .normalize();
    expect(finalDirection.z).toBeLessThan(-0.9);
    expect(finalDirection.y).toBeLessThan(0);
  });

  it("restores the original Follow path and character without replacing timing, clips or edited lenses", () => {
    const recipe = createStoryPreset("endless-descent"),
      before = structuredClone(recipe);
    recipe.cameraMotion!.keys[2].fov = 84;
    recipe.cameraMotion!.audio = {
      enabled: true,
      source: "sub",
      amount: 0.3,
      motion: "lift",
    };
    const follow = withDescentView(recipe, "follow");
    expect(getDescentView(follow)).toBe("follow");
    expect(follow.avatar).toBe(true);
    expect(follow.avatarPose).toEqual(recipe.avatarPose);
    expect(follow.avatarPath).toEqual(recipe.avatarPath);
    expect(follow.avatarMotion).toEqual(recipe.avatarMotion);
    expect(follow.cameraMotion!.audio).toEqual(recipe.cameraMotion!.audio);
    const originals = descentFollowCameraKeys();
    follow.cameraMotion!.keys.forEach((key, index) => {
      expect(key.position).toEqual(originals[index].position);
      expect(key.target).toEqual(originals[index].target);
      expect(key.frame).toBe(recipe.cameraMotion!.keys[index].frame);
      expect(key.fov).toBe(index === 2 ? 84 : 75);
    });
    expect(withDescentView(follow, "first-person")).toEqual(recipe);
    expect(before.avatarPose).toEqual(recipe.avatarPose);
    expect(withDescentView(recipe, "first-person")).toEqual(recipe);
  });

  it("retains manual Shot edits and the view marker even when cameraShot becomes custom", () => {
    const recipe = createStoryPreset("endless-descent"),
      key = recipe.cameraMotion!.keys[2];
    const edited = validateRecipe({
      ...recipe,
      ...shotCameraPatch(recipe, key.frame, {
        position: [
          key.position[0] + 0.25,
          key.position[1] + 0.4,
          key.position[2] + 0.5,
        ],
        target: [key.target[0], key.target[1] + 0.2, key.target[2]],
        fov: 82,
      }),
    });
    expect(edited.cameraShot).toBe("custom");
    expect(getDescentView(edited)).toBe("first-person");
    const returned = withDescentView(
      withDescentView(edited, "follow"),
      "first-person",
    );
    returned.cameraMotion!.keys.forEach((value, index) => {
      const expected = edited.cameraMotion!.keys[index];
      expect(value.fov).toBe(expected.fov);
      expect(value.id).toBe(expected.id);
      value.position.forEach((v, axis) =>
        expect(v).toBeCloseTo(expected.position[axis], 6),
      );
      value.target.forEach((v, axis) =>
        expect(v).toBeCloseTo(expected.target[axis], 6),
      );
    });
  });

  it("keeps the vertical route and acoustic zone crossing times after resizing and retiming", () => {
    const source = createStoryPreset("endless-descent");
    for (const size of [sceneSizeBounds(source).min, 1, 1.5]) {
      const resized = resizeScene(source, size);
      const first = validateRecipe(
        reconcileDuration(resized, { ...resized, seconds: 30 }),
      );
      const follow = withDescentView(first, "follow");
      expect(first.frames).toBe(721);
      expect(getDescentView(first)).toBe("first-person");
      for (const frame of [0, 180, 360, 540, 630, 660, 720]) {
        expect(cameraAt(first, frame)[1]).toBe(cameraAt(follow, frame)[1]);
        expect(evaluateAcousticEnvironment(first, frame).zone.id).toBe(
          evaluateAcousticEnvironment(follow, frame).zone.id,
        );
      }
      expect(follow.cameraMotion!.keys.map((key) => key.frame)).toEqual(
        first.cameraMotion!.keys.map((key) => key.frame),
      );
      const returned = withDescentView(follow, "first-person");
      returned.cameraMotion!.keys.forEach((key, index) =>
        key.position.forEach((v, axis) =>
          expect(v).toBeCloseTo(
            first.cameraMotion!.keys[index].position[axis],
            6,
          ),
        ),
      );
    }
  });

  it("does not offer a descent view for unrelated or incomplete saved camera paths", () => {
    const avenue = createStoryPreset("bass-avenue");
    expect(getDescentView(avenue)).toBeNull();
    expect(() => withDescentView(avenue, "first-person")).toThrow(
      /Endless descent/,
    );
    const edited = createStoryPreset("endless-descent");
    edited.cameraMotion!.keys.splice(2, 1);
    expect(getDescentView(edited)).toBeNull();
  });
});
