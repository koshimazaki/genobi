// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeometryCamera } from "../src/world-builder/geometry-camera";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import {
  cameraAt,
  validateRecipe,
  type Recipe,
} from "../src/world-builder/recipe";

const disposers: Array<() => void> = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

function fixture() {
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width: 400,
    height: 200,
  } as DOMRect);
  let recipe = createMotionPreset("city-to-loft");
  const commit = vi.fn((patch: Partial<Recipe>, frame?: number) => {
    recipe = validateRecipe({ ...recipe, ...patch });
    expect(frame).toBe(80);
  });
  const controls = createGeometryCamera(
    canvas,
    () => recipe,
    () => 80,
    vi.fn(),
    commit,
  );
  disposers.push(() => controls.editor.dispose());
  const pointer = (name: string, x = 50, y = 50, shiftKey = false) =>
    canvas.dispatchEvent(
      new MouseEvent(name, { clientX: x, clientY: y, button: 0, shiftKey }),
    );
  return { canvas, controls, commit, pointer, recipe: () => recipe };
}

describe("manual Shot camera in geometry preview", () => {
  it("commits one exact dragged camera at the preview frame without Build mode", () => {
    const f = fixture();
    const before = f.controls.editor.cameraPose();
    f.pointer("pointerdown");
    f.pointer("pointermove", 80, 65);
    const dragged = f.controls.editor.cameraPose();
    expect(dragged.position).not.toEqual(before.position);
    expect(f.commit).not.toHaveBeenCalled();
    f.pointer("pointerup", 80, 65);
    expect(f.commit).toHaveBeenCalledOnce();
    cameraAt(f.recipe(), 80).forEach((v, axis) =>
      expect(v).toBeCloseTo(dragged.position[axis], 8),
    );
    expect(f.controls.editor.mode).toBe("shot");
  });

  it("keeps pan/zoom and click-to-expand separate from scene editing", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.pointer("pointerup");
    expect(f.commit).not.toHaveBeenCalled();
    const before = f.controls.editor.cameraPose();
    f.pointer("pointerdown", 50, 50, true);
    f.pointer("pointermove", 65, 60, true);
    f.pointer("pointerup", 65, 60, true);
    expect(f.controls.editor.cameraPose().target).not.toEqual(before.target);
    f.canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 80, cancelable: true }),
    );
    expect(f.commit).toHaveBeenCalledTimes(2);
    expect(() => f.controls.editor.setMode("edit")).toThrow("require WebGL");
  });

  it("blocks drag and wheel during playback or an independent loading hold, and cancels an interrupted gesture", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.pointer("pointermove", 100, 80);
    const release = f.controls.editor.holdEdits();
    f.controls.editor.lockEdits(false);
    f.pointer("pointerup", 100, 80);
    f.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 80 }));
    expect(f.commit).not.toHaveBeenCalled();
    release();
    f.controls.editor.lockEdits(true);
    f.pointer("pointerdown");
    f.pointer("pointermove", 100, 80);
    f.pointer("pointerup", 100, 80);
    expect(f.commit).not.toHaveBeenCalled();
    f.controls.editor.lockEdits(false);
    f.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -30 }));
    expect(f.commit).toHaveBeenCalledOnce();
  });
});
