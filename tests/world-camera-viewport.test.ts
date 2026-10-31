// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as T from "three";
import { createInteraction } from "../src/world-builder/interaction";
import { viewportShotRecipe } from "../src/world-builder/camera-viewport";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import {
  cameraAt,
  cameraTargetAt,
  cameraFovAt,
  presetRecipe,
} from "../src/world-builder/recipe";
import type { Playground } from "../src/world-builder/playground";

afterEach(() => vi.unstubAllGlobals());

describe("freezing a viewport with a saved camera path", () => {
  it("copies an exact paired-state camera without legacy orbit clamps", () => {
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const recipe = createMotionPreset("city-to-loft"),
      camera = new T.PerspectiveCamera(73, 16 / 9, 0.05, 600),
      target: [number, number, number] = [2, 20, -4];
    camera.position.set(22, 40, 70);
    const editor = createInteraction(
      document.createElement("canvas"),
      new T.Scene(),
      camera,
      new T.Group(),
      new T.Group(),
      { avatar: new T.Group(), editable: new Map() } as unknown as Playground,
      () => {},
      () => recipe,
      () => {},
    );
    editor.refresh(target);
    const expected = { position: camera.position.toArray(), target, fov: 73 },
      pose = editor.cameraPose();
    expect(pose).toEqual(expected);
    expect(pose.position[1]).toBeCloseTo(40, 10);
    expect(editor.viewPatch().targetY).toBe(20);
    expect(editor.viewPatch().radius).toBeCloseTo(Math.hypot(20, 20, 74), 10);
    pose.position[0] = 0;
    pose.target[1] = 0;
    expect(editor.cameraPose()).toEqual(expected);
    editor.dispose();
  });

  it("keeps the current lens and keyed look target when Build becomes the captured shot", () => {
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const recipe = createMotionPreset("city-to-loft");
    const canvas = document.createElement("canvas"),
      camera = new T.PerspectiveCamera(68, 16 / 9, 0.05, 600),
      target: [number, number, number] = [2, 2, -4];
    camera.position.set(2, 2, 5);
    camera.lookAt(...target);
    const editor = createInteraction(
      canvas,
      new T.Scene(),
      camera,
      new T.Group(),
      new T.Group(),
      { avatar: new T.Group(), editable: new Map() } as unknown as Playground,
      () => {},
      () => recipe,
      () => {},
    );
    // Shot refresh updates the orbit pivot before the person enters Build.
    editor.refresh(target);
    editor.setMode("edit");
    const next = viewportShotRecipe(recipe, editor.freeze());
    expect(editor.mode).toBe("shot");
    expect(next.cameraMotion?.enabled).toBe(false);
    expect(next.cameraMotion?.keys).toEqual(recipe.cameraMotion?.keys);
    expect(recipe.cameraMotion?.enabled).toBe(true);
    expect(cameraFovAt(next, 0)).toBe(68);
    expect(cameraTargetAt(next, 0)).toEqual(target);
    cameraAt(next, 0).forEach((value, i) =>
      expect(value).toBeCloseTo(camera.position.toArray()[i], 10),
    );
    editor.dispose();
  });

  it("keeps an old recipe on its existing camera contract without adding a path", () => {
    const old = presetRecipe("Studio");
    const next = viewportShotRecipe(old, {
      targetX: 3,
      targetY: 2,
      targetZ: -4,
      radius: 9,
      fov: 63,
    });
    expect(next.cameraMotion).toBeUndefined();
    expect(next.cameraShot).toBe("custom");
    expect(cameraTargetAt(next, 0)).toEqual([3, 2, -4]);
    expect(cameraFovAt(next, 0)).toBe(63);
  });
});
