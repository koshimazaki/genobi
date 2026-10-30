import { describe, expect, it } from "vitest";
import {
  clampFrame,
  defaultFrame,
  isCompact,
  keyStep,
  KEY_STEP,
  KEY_STEP_LARGE,
  MIN_FRAME,
  moveFrame,
  resizeFrame,
} from "../src/arena/window-frame";

const desktop = { width: 1440, height: 900 };

describe("the enlarged comparison window", () => {
  it("opens centred and on screen", () => {
    const frame = defaultFrame(desktop);
    expect(frame.width).toBe(1382);
    expect(frame.x).toBe(29);
    expect(frame.y + frame.height).toBeLessThanOrEqual(desktop.height);
  });

  it("moves but never leaves the screen", () => {
    const frame = { x: 100, y: 100, width: 600, height: 400 };
    expect(moveFrame(frame, 50, -20, desktop)).toMatchObject({ x: 150, y: 80 });
    expect(moveFrame(frame, -500, -500, desktop)).toMatchObject({ x: 0, y: 0 });
    expect(moveFrame(frame, 5000, 5000, desktop)).toMatchObject({
      x: desktop.width - 600,
      y: desktop.height - 400,
    });
  });

  it("resizes from its corner between the minimum and the screen edge", () => {
    const frame = { x: 100, y: 100, width: 600, height: 400 };
    expect(resizeFrame(frame, 100, 50, desktop)).toEqual({
      ...frame,
      width: 700,
      height: 450,
    });
    expect(resizeFrame(frame, -1000, -1000, desktop)).toMatchObject(MIN_FRAME);
    expect(resizeFrame(frame, 5000, 5000, desktop)).toEqual({
      x: 100,
      y: 100,
      width: desktop.width - 100,
      height: desktop.height - 100,
    });
  });

  it("fits a smaller screen after the window is resized", () => {
    const frame = { x: 900, y: 500, width: 800, height: 600 };
    const small = { width: 700, height: 500 };
    const fitted = clampFrame(frame, small);
    expect(fitted).toEqual({ x: 0, y: 0, width: 700, height: 500 });
  });

  it("steps with the arrow keys, further with Shift", () => {
    expect(keyStep("ArrowRight", false)).toEqual([KEY_STEP, 0]);
    expect(keyStep("ArrowUp", true)).toEqual([0, -KEY_STEP_LARGE]);
    expect(keyStep("Enter", false)).toBeNull();
  });

  it("fills a phone screen instead of floating", () => {
    expect(isCompact({ width: 390, height: 844 })).toBe(true);
    expect(isCompact(desktop)).toBe(false);
  });
});
