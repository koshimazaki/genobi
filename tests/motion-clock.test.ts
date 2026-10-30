import { afterEach, describe, expect, it, vi } from "vitest";
// The small native browser module is intentionally shipped without a bundler.
// @ts-expect-error Native browser module has no declaration file.
import * as clock from "../public/motion/construction/clock.js";

afterEach(() => {
  clock.installClock().restore();
  vi.unstubAllGlobals();
});
describe("construction capture clock", () => {
  it("advances timers and animation without wall-clock waits", () => {
    const frames: number[] = [];
    const timer = vi.fn();
    const capture = clock.installClock();
    clock.setTimeout(timer, 100);
    const animate = (now: number) => {
      frames.push(now);
      clock.requestAnimationFrame(animate);
    };
    clock.requestAnimationFrame(animate);
    capture.advance(50);
    expect(frames).toEqual([50]);
    expect(timer).not.toHaveBeenCalled();
    capture.advance(50);
    expect(frames).toEqual([50, 100]);
    expect(timer).toHaveBeenCalledOnce();
  });
  it("cancels queued work and discards callbacks between captures", () => {
    const callback = vi.fn();
    const first = clock.installClock();
    clock.cancelAnimationFrame(clock.requestAnimationFrame(callback));
    clock.clearTimeout(clock.setTimeout(callback, 10));
    first.advance(20);
    expect(callback).not.toHaveBeenCalled();
    clock.requestAnimationFrame(callback);
    first.restore();
    clock.installClock().advance(100);
    expect(callback).not.toHaveBeenCalled();
  });
  it("returns ordinary playback to the native browser clock", () => {
    const native = {
      performance: { now: () => 42 },
      requestAnimationFrame: vi.fn(() => 99),
      cancelAnimationFrame: vi.fn(),
      setTimeout: vi.fn(() => 100),
      clearTimeout: vi.fn(),
    };
    vi.stubGlobal("window", native);
    clock.installClock().restore();
    const callback = vi.fn();
    expect(clock.performance.now()).toBe(42);
    expect(clock.requestAnimationFrame(callback)).toBe(99);
    clock.cancelAnimationFrame(99);
    expect(native.cancelAnimationFrame).toHaveBeenCalledWith(99);
    expect(clock.setTimeout(callback, 20)).toBe(100);
    clock.clearTimeout(100);
    expect(native.clearTimeout).toHaveBeenCalledWith(100);
  });
});
