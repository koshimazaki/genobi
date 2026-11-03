// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as T from "three";
import { createInteraction } from "../src/world-builder/interaction";
import { presetRecipe } from "../src/world-builder/recipe";
import type { Playground } from "../src/world-builder/playground";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function setup() {
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const canvas = document.createElement("canvas"),
    camera = new T.PerspectiveCamera(55, 16 / 9, 0.05, 600),
    commit = vi.fn(),
    render = vi.fn();
  canvas.tabIndex = 0;
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  });
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 640, 360);
  document.body.append(canvas);
  camera.position.set(12, 8, 18);
  const editor = createInteraction(
    canvas,
    new T.Scene(),
    camera,
    new T.Group(),
    new T.Group(),
    { avatar: new T.Group(), editable: new Map() } as unknown as Playground,
    render,
    () => presetRecipe("Studio"),
    () => {},
    () => {},
    commit,
  );
  editor.refresh([0, 2, 0]);
  return { canvas, camera, editor, commit, render };
}

function pointer(
  canvas: HTMLCanvasElement,
  type: string,
  x: number,
  shiftKey = false,
) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: 120,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    shiftKey,
    bubbles: true,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  canvas.dispatchEvent(event);
}

const wheel = (canvas: HTMLCanvasElement) =>
  canvas.dispatchEvent(
    new WheelEvent("wheel", { deltaY: 120, cancelable: true }),
  );

describe("direct camera gestures in Shot", () => {
  it("orbits and pans directly, commits once per drag, and keeps Shot mode", () => {
    const { canvas, editor, commit } = setup(),
      before = editor.cameraPose();
    pointer(canvas, "pointerdown", 100);
    pointer(canvas, "pointermove", 160);
    pointer(canvas, "pointermove", 190);
    expect(commit).not.toHaveBeenCalled();
    expect(editor.dragging).toBe(true);
    pointer(canvas, "pointerup", 190);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(editor.cameraPose());
    expect(editor.cameraPose().position).not.toEqual(before.position);
    expect(editor.mode).toBe("shot");
    const target = editor.cameraPose().target;
    pointer(canvas, "pointerdown", 100, true);
    pointer(canvas, "pointermove", 150, true);
    pointer(canvas, "pointerup", 150, true);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(editor.cameraPose().target).not.toEqual(target);
    expect(editor.dragging).toBe(false);
    editor.dispose();
  });

  it("blocks wheel zoom during playback and overlapping async ownership", () => {
    const { canvas, editor, commit } = setup(),
      before = editor.cameraPose();
    editor.lockEdits(true);
    const release = editor.holdEdits();
    wheel(canvas);
    editor.lockEdits(false);
    wheel(canvas);
    expect(editor.cameraPose()).toEqual(before);
    expect(commit).not.toHaveBeenCalled();
    release();
    wheel(canvas);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(editor.cameraPose());
    expect(editor.cameraPose().position).not.toEqual(before.position);
    editor.dispose();
  });

  it("restores a tentative drag on capture/loading lock and cannot resume it", () => {
    const { canvas, editor, commit, render } = setup(),
      before = editor.cameraPose();
    pointer(canvas, "pointerdown", 100);
    pointer(canvas, "pointermove", 180);
    expect(editor.cameraPose().position).not.toEqual(before.position);
    const release = editor.holdEdits();
    expect(editor.cameraPose()).toEqual(before);
    expect(editor.dragging).toBe(false);
    render.mockClear();
    pointer(canvas, "pointermove", 240);
    expect(render).not.toHaveBeenCalled();
    release();
    pointer(canvas, "pointermove", 270);
    pointer(canvas, "pointerup", 270);
    expect(commit).not.toHaveBeenCalled();
    expect(editor.cameraPose()).toEqual(before);
    wheel(canvas);
    expect(commit).toHaveBeenCalledTimes(1);
    editor.dispose();
  });
});
