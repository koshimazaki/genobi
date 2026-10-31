// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveSession } from "../src/world-builder/live-session";
import { presetRecipe } from "../src/world-builder/recipe";
import type { WorldRuntime } from "../src/world-builder/runtime";

const exports = vi.hoisted(() => ({
  png: vi.fn<() => Promise<Blob>>(),
  hash: vi.fn<() => Promise<string>>(),
}));
vi.mock("../src/world-builder/export-take", () => exports);

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function setup() {
  const trackStop = vi.fn();
  const stream = {
    getTracks: () => [{ stop: trackStop }],
  } as unknown as MediaStream;
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    state = "inactive";
    mimeType = "video/webm";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    onerror?: () => void;
    constructor(readonly stream: MediaStream) {}
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(["video"]) });
        this.onstop?.();
      });
    }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  const canvas = {
    captureStream: () => stream,
  } as unknown as HTMLCanvasElement;
  const world = {
    editor: { mode: "walk", state: () => ({ mode: "walk" }) },
  } as unknown as WorldRuntime;
  const onTake = vi.fn();
  const session = liveSession(
    canvas,
    world,
    { getRecipe: () => presetRecipe("Playground"), configure: vi.fn() },
    onTake,
    vi.fn(),
  );
  return { session, trackStop, onTake };
}

beforeEach(() => {
  vi.useFakeTimers();
  exports.png.mockReset().mockResolvedValue(new Blob(["first-frame"]));
  exports.hash.mockReset().mockResolvedValue("sha256");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live recording runtime ownership", () => {
  it("holds ownership while the first PNG is pending and until the stopped clip is finalized", async () => {
    const f = setup();
    const first = deferred<Blob>();
    exports.png.mockReturnValueOnce(first.promise);
    const starting = f.session.startRecording();
    expect(f.session.status()).toMatchObject({
      recording: false,
      recordingBusy: true,
    });
    expect(f.trackStop).not.toHaveBeenCalled();
    first.resolve(new Blob(["first-frame"]));
    await starting;
    expect(f.session.status()).toMatchObject({
      recording: true,
      recordingBusy: true,
    });
    const finalized = deferred<string>();
    exports.hash.mockReturnValueOnce(finalized.promise);
    const stopping = f.session.stopRecording();
    await vi.advanceTimersByTimeAsync(0);
    await flush();
    expect(f.session.status()).toMatchObject({
      recording: false,
      recordingBusy: true,
    });
    expect(f.onTake).not.toHaveBeenCalled();
    finalized.resolve("sha256");
    await stopping;
    expect(f.session.status()).toMatchObject({
      recording: false,
      recordingBusy: false,
    });
    expect(f.onTake).toHaveBeenCalledOnce();
    expect(f.trackStop).toHaveBeenCalledOnce();
    f.session.dispose();
  });

  it("releases ownership and the stream if the first PNG fails", async () => {
    const f = setup();
    const first = deferred<Blob>();
    exports.png.mockReturnValueOnce(first.promise);
    const starting = f.session.startRecording();
    expect(f.session.status().recordingBusy).toBe(true);
    first.reject(new Error("PNG failed"));
    await expect(starting).rejects.toThrow("PNG failed");
    expect(f.session.status().recordingBusy).toBe(false);
    expect(f.trackStop).toHaveBeenCalledOnce();
    expect(f.onTake).not.toHaveBeenCalled();
    f.session.dispose();
  });
});
