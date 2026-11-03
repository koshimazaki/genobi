import { afterEach, expect, it, vi } from "vitest";
import {
  applyCameraRecipe,
  onCameraRecipe,
  type CameraRecipePatch,
} from "../src/camera-recipe-target";
import { recreateGapMessage } from "../src/recreate-gaps";

afterEach(() => vi.useRealTimers());

const recipe: CameraRecipePatch = {
  patch: { description: "a fox", imageReferences: [], imageRegions: [] },
  note: "Restored this asset's prompt. Nothing was generated.",
};

it("holds a recipe until Camera's composer mounts, then lands it whole", () => {
  expect(applyCameraRecipe(recipe)).toBe(false);
  const received: CameraRecipePatch[] = [];
  const stop = onCameraRecipe((r) => received.push(r));
  expect(received).toEqual([recipe]);
  // Landed once: a later composer does not receive it again.
  stop();
  const again: CameraRecipePatch[] = [];
  onCameraRecipe((r) => again.push(r))();
  expect(again).toEqual([]);
});

it("drops a held recipe that waited too long", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  applyCameraRecipe(recipe);
  vi.setSystemTime(new Date("2026-11-02T12:00:16Z"));
  const received: CameraRecipePatch[] = [];
  onCameraRecipe((r) => received.push(r))();
  expect(received).toEqual([]);
});

it("words a missing provider as information, and asks only for inputs", () => {
  const provider = recreateGapMessage(["provider"]);
  expect(provider).toContain(
    "Which provider it ran on was not stored; Camera keeps Auto.",
  );
  expect(provider).not.toMatch(/Choose them again|Reattach/);
  const both = recreateGapMessage(["source video", "provider"]);
  expect(both).toContain("Not stored for this run: source video.");
  expect(both).toContain("Choose them again before generating.");
  expect(recreateGapMessage(["reference images"])).toContain(
    "Reattach the references before generating.",
  );
});
