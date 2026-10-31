// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInputTakeSession,
  inputSignalRecipe,
  type InputTakeState,
} from "../src/world-builder/input-take-session";
import type { InputAudio } from "../src/world-builder/input-audio";
import type { WorldRuntime } from "../src/world-builder/runtime";
import { motionRecipe } from "./scene-motion-fixture";
import { validateRecipe } from "../src/world-builder/recipe";

const signals = { level: 0.5, low: 0.2, mid: 0.3, high: 0.1, sub: 0.08 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function setup() {
  const recipe = motionRecipe(3, 4),
    before = structuredClone(recipe);
  let resolve!: (blob: Blob) => void, reject!: (error: Error) => void;
  const done = new Promise<Blob>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void done.catch(() => {});
  const recorded = new Blob(["dry recording"], { type: "audio/webm" });
  const device: InputAudio = {
    start: vi.fn(),
    sample: () => signals,
    stop: vi.fn(() => resolve(recorded)),
    cancel: vi.fn(() => reject(new DOMException("cancelled", "AbortError"))),
    done,
  };
  const states: InputTakeState[] = [];
  let locked = false,
    alive = true;
  const release = vi.fn();
  const world = {
    configure: vi.fn(),
    renderFrame: vi.fn(async () => document.createElement("canvas")),
    editor: { setMode: vi.fn(), holdEdits: () => release },
  } as unknown as Pick<WorldRuntime, "configure" | "renderFrame" | "editor">;
  const deps = {
    world,
    getRecipe: () => recipe,
    ready: () => {
      if (locked) throw new Error("Scene is busy");
    },
    stopPlayback: vi.fn(),
    settle: async () => {},
    lock: vi.fn((value: boolean) => {
      locked = value;
    }),
    alive: () => alive,
    load: vi.fn(async () => {}),
    state: (value: InputTakeState) => states.push(value),
    frame: vi.fn(),
    status: vi.fn(),
    open: vi.fn<(signal: AbortSignal) => Promise<InputAudio>>(
      async () => device,
    ),
  };
  return {
    recipe,
    before,
    device,
    recorded,
    world,
    deps,
    states,
    release,
    unmount: () => {
      alive = false;
    },
    session: createInputTakeSession(deps),
  };
}

describe("input take runtime ownership and repeatable handoff", () => {
  it("stops playback, owns the preview transiently, then restores and hands recorded audio to normal analysis", async () => {
    const f = setup();
    const running = f.session.start();
    await flush();
    expect(f.deps.stopPlayback).toHaveBeenCalledOnce();
    expect(f.device.start).toHaveBeenCalledOnce();
    expect(() => f.deps.ready()).toThrow(/busy/);
    expect(f.states.at(-1)).toMatchObject({
      phase: "recording",
      frame: 0,
      signals,
    });
    const preview = vi.mocked(f.world.configure).mock.calls[0][0];
    expect(preview.envelope).toEqual([0.5, 0.5]);
    expect(preview.bandEnvelopes.sub).toEqual([0.08, 0.08]);
    expect(f.recipe).toEqual(f.before);
    f.session.stop();
    await running;
    expect(f.world.configure).toHaveBeenLastCalledWith(f.before);
    expect(f.deps.load).toHaveBeenCalledOnce();
    expect(f.deps.load).toHaveBeenCalledWith(f.recorded);
    expect(f.deps.lock).toHaveBeenLastCalledWith(false);
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.session.status()).toBe("idle");
    expect(f.recipe).toEqual(f.before);
  });

  it("automatically stops at the current take duration", async () => {
    const f = setup();
    const running = f.session.start();
    await flush();
    await vi.advanceTimersByTimeAsync(
      (f.recipe.frames / f.recipe.fps) * 1000 + 1,
    );
    await running;
    expect(f.device.stop).toHaveBeenCalledOnce();
    expect(f.deps.load).toHaveBeenCalledWith(f.recorded);
  });

  it("releases the guard after permission failure and preserves the saved recipe", async () => {
    const f = setup();
    f.deps.open.mockRejectedValue(new Error("Permission denied"));
    await expect(f.session.start()).rejects.toThrow(/Permission denied/);
    expect(f.deps.lock).toHaveBeenLastCalledWith(false);
    expect(f.deps.load).not.toHaveBeenCalled();
    expect(f.recipe).toEqual(f.before);
  });

  it("cancels promptly while permission is pending, without loading audio", async () => {
    const f = setup();
    f.deps.open.mockImplementation(
      (signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        }),
    );
    const running = f.session.start();
    await flush();
    f.session.cancel();
    await running;
    expect(f.deps.load).not.toHaveBeenCalled();
    expect(f.deps.lock).toHaveBeenLastCalledWith(false);
    expect(f.session.status()).toBe("idle");
  });

  it("stops recording on unmount and never mutates a disposed runtime or starts offline loading", async () => {
    const f = setup();
    const running = f.session.start();
    await flush();
    const draws = vi.mocked(f.world.configure).mock.calls.length;
    f.unmount();
    f.session.dispose();
    await running;
    expect(f.device.cancel).toHaveBeenCalled();
    expect(f.world.configure).toHaveBeenCalledTimes(draws);
    expect(f.deps.load).not.toHaveBeenCalled();
  });

  it("waits for the in-flight preview frame before restoring the recipe or loading a recording", async () => {
    const f = setup();
    let complete!: (canvas: HTMLCanvasElement) => void;
    vi.mocked(f.world.renderFrame).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const running = f.session.start();
    await flush();
    f.session.stop();
    await flush();
    expect(f.deps.load).not.toHaveBeenCalled();
    complete(document.createElement("canvas"));
    await running;
    expect(f.world.configure).toHaveBeenLastCalledWith(f.before);
    expect(f.deps.load).toHaveBeenCalledWith(f.recorded);
  });

  it("cancels and releases the runtime if an input sampler fails", async () => {
    const f = setup();
    f.device.sample = () => {
      throw new Error("Input device stopped");
    };
    await expect(f.session.start()).rejects.toThrow(/Input device stopped/);
    expect(f.device.cancel).toHaveBeenCalled();
    expect(f.deps.lock).toHaveBeenLastCalledWith(false);
    expect(f.deps.load).not.toHaveBeenCalled();
  });

  it("uses at most241 slots and removes prior-track energy from the transient sample", () => {
    const base = validateRecipe({
      ...motionRecipe(),
      frames: 241,
      seconds: 10,
      envelope: Array(241).fill(1),
    });
    const sample = inputSignalRecipe(base, 240, signals);
    expect(sample.envelope).toHaveLength(241);
    expect(sample.envelope.slice(0, 240).every((value) => value === 0)).toBe(
      true,
    );
    expect(sample.envelope[240]).toBe(0.5);
    expect(validateRecipe(sample)).toEqual(sample);
    expect(base.envelope[0]).toBe(1);
    expect(() => inputSignalRecipe(base, 241, signals)).toThrow(/outside/);
  });
});
