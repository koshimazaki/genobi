import { expect, it } from "vitest";
import { Vector3 } from "three";
import { clipProjectionFace } from "../src/world-builder/projection-clipping";
import { mannequinGuide } from "../src/world-builder/mannequin-guide";
import { defaultRecipe } from "../src/world-builder/recipe";

it("retains the visible part of a wall as the falling camera crosses it", () => {
  const wall = [
    new Vector3(-2, -2, -4),
    new Vector3(2, -2, -4),
    new Vector3(2, 2, 1),
    new Vector3(-2, 2, 1),
  ];
  const clipped = clipProjectionFace(wall);
  expect(clipped).toHaveLength(4);
  expect(clipped.every((point) => point.z <= -0.05 + 1e-12)).toBe(true);
  expect(
    clipped.filter((point) => Math.abs(point.z + 0.05) < 1e-12),
  ).toHaveLength(2);
  expect(
    clipProjectionFace(wall.map((point) => point.clone().setZ(1))),
  ).toEqual([]);
});

it("shows a metre-height human guide only for the mannequin asset", () => {
  const recipe = { ...structuredClone(defaultRecipe), avatar: true };
  const parts = mannequinGuide({ ...recipe, avatarAsset: "mannequin" }, 0);
  const top = Math.max(...parts.map((part) => part.y + part.scaleY! / 2));
  const bottom = Math.min(...parts.map((part) => part.y - part.scaleY! / 2));
  expect(top - bottom).toBeCloseTo(1.8);
  expect(mannequinGuide({ ...recipe, avatarAsset: "pug" }, 0)).toEqual([]);
  expect(mannequinGuide({ ...recipe, avatar: false }, 0)).toEqual([]);
});
