import { describe, expect, it } from "vitest";
import { frameLoop, type FrameWindow } from "../src/world-builder/frame-loop";

/** A window whose frames run only when the test flushes them. */
function fakeWindow(name: string) {
  const frames = new Map<number, (now: number) => void>();
  const hide: (() => void)[] = [];
  let next = 0;
  const w = {
    name,
    closed: false,
    requestAnimationFrame(cb: (now: number) => void) {
      frames.set(++next, cb);
      return next;
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id);
    },
    addEventListener(type: string, cb: () => void) {
      if (type === "pagehide") hide.push(cb);
    },
    removeEventListener() {},
    /** Run every pending frame, as a painting window would. */
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      for (const cb of pending) cb(0);
    },
    /** Close it: pending frames never fire, then pagehide. */
    close() {
      w.closed = true;
      frames.clear();
      for (const cb of hide.splice(0)) cb();
    },
    pending: () => frames.size,
  };
  return w;
}

describe("The scope loop across windows", () => {
  it("follows the panel into PiP and back to the page when PiP closes", () => {
    const page = fakeWindow("page");
    const pip = fakeWindow("pip");
    let holder: FrameWindow = page;
    let steps = 0;
    const stop = frameLoop(
      () => steps++,
      () => holder,
      page,
    );
    page.flush();
    expect(steps).toBe(1);
    // Popped out: the next frame is scheduled in the PiP window.
    holder = pip;
    page.flush();
    expect(steps).toBe(2);
    expect(pip.pending()).toBe(1);
    pip.flush();
    expect(steps).toBe(3);
    // Docked back: the panel moves home and the PiP window closes with a
    // frame still pending there. The loop must carry on on the page.
    holder = page;
    pip.close();
    expect(page.pending()).toBe(1);
    page.flush();
    page.flush();
    expect(steps).toBe(5);
    stop();
    page.flush();
    expect(steps).toBe(5);
  });

  it("never schedules on a window that has already closed", () => {
    const page = fakeWindow("page");
    const pip = fakeWindow("pip");
    pip.closed = true;
    let steps = 0;
    frameLoop(
      () => steps++,
      () => pip,
      page,
    );
    expect(pip.pending()).toBe(0);
    page.flush();
    expect(steps).toBe(1);
  });

  it("ignores a stale pagehide once it has moved on", () => {
    const page = fakeWindow("page");
    const pip = fakeWindow("pip");
    let holder: FrameWindow = pip;
    let steps = 0;
    frameLoop(
      () => steps++,
      () => holder,
      page,
    );
    holder = page;
    pip.flush();
    expect(page.pending()).toBe(1);
    pip.close();
    // No duplicate loop: still exactly one frame pending at home.
    expect(page.pending()).toBe(1);
    page.flush();
    expect(steps).toBe(2);
  });
});
