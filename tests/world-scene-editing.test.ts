import { describe, it, expect } from "vitest";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { validateRecipe } from "../src/world-builder/recipe";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import {
  editableSceneObjects,
  patchSceneObject,
  sceneFrameAfterEdit,
  withAddedSceneObject,
  removeSceneObject,
} from "../src/world-builder/scene-editing";
import { reconcileDuration } from "../src/world-builder/take-duration";
import { sceneCaptureInfo } from "../src/world-builder/scene-capture";
import { readDeployInput } from "../shared/comfy/deploy-input";

describe("authored scene editing and receipts", () => {
  it("refuses motion in the static acoustic deployment contract before submission", () => {
    const recipe = createMotionPreset("apartment-morph");
    const formatted = validateRecipe(
      reconcileDuration(recipe, {
        ...recipe,
        frames: 193,
        seconds: 8,
        width: 1024,
        height: 576,
      }),
    );
    expect(() =>
      readDeployInput({
        seed: 0,
        negativePrompt: "",
        assets: {},
        recipe: JSON.stringify(formatted),
      }),
    ).toThrow(/static room acoustics/);
  });
  it("edits one voxel key without baking audio or twist, retaining other states", () => {
    const recipe = createMotionPreset("fruit-morph");
    recipe.envelope = Array(145).fill(1);
    recipe.bandEnvelopes = { low: Array(145).fill(1), mid: [], high: [] };
    const before = structuredClone(recipe);
    const prop = editableSceneObjects(recipe, 72)[0];
    const updated = validateRecipe({
      ...recipe,
      ...patchSceneObject(recipe, 72, prop.id, { x: prop.x + 1 }),
    });
    expect(updated.motion!.stateKeys[1].objects[prop.id].x).toBeCloseTo(
      prop.x + 1,
    );
    expect(updated.motion!.stateKeys[0]).toEqual(before.motion!.stateKeys[0]);
    expect(updated.motion!.stateKeys[2]).toEqual(before.motion!.stateKeys[2]);
    expect(updated.envelope).toEqual(before.envelope);
    expect(recipe).toEqual(before);
  });

  it("seeds an unkeyed authored primitive across every key when first edited", () => {
    let recipe = createMotionPreset("voxel-architecture");
    const prop = {
      id: "new-prop",
      shape: "box" as const,
      x: 1,
      y: 2,
      z: 0,
      scale: 1,
      spin: 0,
      color: "#ffffff",
      prompt: "",
    };
    recipe = validateRecipe({ ...recipe, objects: [prop] });
    const updated = validateRecipe({
      ...recipe,
      ...patchSceneObject(recipe, 72, prop.id, { x: 3, spin: 0.5 }),
    });
    expect(
      updated.motion!.stateKeys.map((key) => key.objects[prop.id].x),
    ).toEqual([1, 3, 1]);
    expect(updated.objects[0].spin).toBe(0.5);
  });

  it("adds and removes authored primitives without breaking the state identities", () => {
    const recipe = createMotionPreset("apartment-morph");
    const prop = { ...recipe.objects[0], id: "new-prop" };
    const added = validateRecipe(withAddedSceneObject(recipe, prop));
    expect(added.motion!.stateKeys.every((key) => key.objects[prop.id])).toBe(
      true,
    );
    const removed = validateRecipe({
      ...added,
      objects: added.objects.filter((p) => p.id !== prop.id),
      motion: removeSceneObject(added, prop.id),
    });
    expect(evaluateScene(removed, 72)).toEqual(evaluateScene(recipe, 72));
  });

  it("retimes an unchanged sequence while keeping the selected state, but refuses malformed imports", () => {
    const recipe = createMotionPreset("fruit-morph");
    const shorter = validateRecipe(
      reconcileDuration(recipe, { ...recipe, frames: 73 }),
    );
    expect(shorter.motion!.stateKeys.map((k) => k.frame)).toEqual([0, 36, 72]);
    expect(sceneFrameAfterEdit(recipe, shorter, 72)).toBe(36);
    const imported = structuredClone(recipe);
    imported.frames = 73;
    imported.seconds = 73 / 24;
    imported.motion!.stateKeys[1].label = "Changed import";
    expect(() => validateRecipe(reconcileDuration(recipe, imported))).toThrow(
      /state/i,
    );
  });

  it("fingerprints motion/control/camera inputs and leaves legacy receipts alone", async () => {
    const recipe = createMotionPreset("fruit-morph");
    const a = await sceneCaptureInfo(recipe);
    expect(a?.recipeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await sceneCaptureInfo(structuredClone(recipe))).toEqual(a);
    const b = await sceneCaptureInfo({ ...recipe, envelope: [1] });
    expect(b?.controlEnvelopeSha256).not.toBe(a?.controlEnvelopeSha256);
    expect(b?.firstGeometrySha256).not.toBe(a?.firstGeometrySha256);
    const c = await sceneCaptureInfo({
      ...recipe,
      azimuth: recipe.azimuth + 1,
    });
    expect(c?.firstGeometrySha256).not.toBe(a?.firstGeometrySha256);
    expect(
      await sceneCaptureInfo({ ...recipe, motion: undefined }),
    ).toBeUndefined();
  });
});
