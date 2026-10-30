// A recording that fails to start, or cannot be decoded, leaves nothing held:
// no microphone track, no audio context, no prewarmed worker.
import { describe, expect, it, vi } from "vitest";
import {
  deliverNote,
  openCapture,
  type CaptureEnv,
} from "../src/voice/capture";

/** Stand-ins for a granted stream and the browser's audio objects. */
function browser(fail?: "context" | "recorder" | "start") {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const close = vi.fn(async () => {});
  const start = vi.fn(() => {
    if (fail === "start") throw new DOMException("bad", "NotSupportedError");
  });
  const env: CaptureEnv = {
    createContext: () => {
      if (fail === "context") throw new Error("no audio context");
      return {
        createAnalyser: () => ({ fftSize: 0 }),
        createMediaStreamSource: () => ({ connect: () => {} }),
        close,
      } as unknown as AudioContext;
    },
    createRecorder: () => {
      if (fail === "recorder") throw new Error("no recorder");
      return { start } as unknown as MediaRecorder;
    },
  };
  return { stream, env, track, close, start };
}

describe("starting a recording after permission", () => {
  it("opens the meter and starts the recorder", () => {
    const { stream, env, track, close, start } = browser();
    const capture = openCapture(stream, env);
    expect(capture.analyser.fftSize).toBe(2048);
    expect(start).toHaveBeenCalledWith(250);
    expect(track.stop).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    ["the audio context", "context", false],
    ["the recorder", "recorder", true],
    ["recorder.start()", "start", true],
  ] as const)(
    "stops the tracks when %s fails, closing a created context",
    (_, fail, closes) => {
      const { stream, env, track, close } = browser(fail);
      expect(() => openCapture(stream, env)).toThrow();
      expect(track.stop).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(closes ? 1 : 0);
    },
  );
});

describe("delivering a note", () => {
  const signal = new AbortController().signal;
  const recording = new Blob([new Uint8Array(4)]);

  it("cancels the prewarm when the recording cannot be decoded", async () => {
    const env = {
      toWav: vi.fn(async () => {
        throw new DOMException("short", "EncodingError");
      }),
      send: vi.fn(),
      cancelPrewarm: vi.fn(),
    };
    await expect(
      deliverNote(recording, 180, signal, "English", env),
    ).rejects.toMatchObject({ name: "EncodingError" });
    expect(env.cancelPrewarm).toHaveBeenCalledTimes(1);
    expect(env.send).not.toHaveBeenCalled();
  });

  it("sends a decoded note, with the limit, and cancels nothing", async () => {
    const wav = new Blob([], { type: "audio/wav" });
    const env = {
      toWav: vi.fn(async () => wav),
      send: vi.fn(async () => ({ text: "pan left" })),
      cancelPrewarm: vi.fn(),
    };
    expect(await deliverNote(recording, 180, signal, "auto", env)).toEqual({
      text: "pan left",
    });
    expect(env.toWav).toHaveBeenCalledWith(recording, 180);
    expect(env.send).toHaveBeenCalledWith(wav, signal, "auto");
    expect(env.cancelPrewarm).not.toHaveBeenCalled();
  });
});
