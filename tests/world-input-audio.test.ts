import { describe, expect, it, vi } from "vitest";
import {
  inputAudioUnavailable,
  openInputAudio,
  INPUT_AUDIO_LIMIT,
} from "../src/world-builder/input-audio";
import { inputAudioMocks } from "./input-audio-mocks";
import { subBandSections } from "../src/world-builder/audio-bands";

describe("explicit, bounded synth input resources", () => {
  it("checks capabilities without requesting any hardware", async () => {
    const mock = inputAudioMocks();
    mock.env.secure = false;
    expect(inputAudioUnavailable(mock.env)).toMatch(/HTTPS or localhost/);
    await expect(
      openInputAudio(new AbortController().signal, mock.env),
    ).rejects.toThrow(/HTTPS or localhost/);
    expect(mock.getUserMedia).not.toHaveBeenCalled();
    expect(mock.MockContext.instances).toHaveLength(0);
  });

  it("closes the audio context when the person denies permission", async () => {
    const mock = inputAudioMocks();
    mock.getUserMedia.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );
    await expect(
      openInputAudio(new AbortController().signal, mock.env),
    ).rejects.toThrow(/Permission denied/);
    expect(mock.MockContext.instances[0].resume).toHaveBeenCalledOnce();
    expect(mock.MockContext.instances[0].close).toHaveBeenCalledOnce();
    expect(mock.MockRecorder.instances).toHaveLength(0);
  });

  it("cancels a pending permission request promptly and stops a subsequently granted stream", async () => {
    const mock = inputAudioMocks(),
      abort = new AbortController();
    let grant!: (stream: MediaStream) => void;
    mock.getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    );
    const opening = openInputAudio(abort.signal, mock.env);
    abort.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(mock.MockContext.instances[0].close).toHaveBeenCalledOnce();
    grant(mock.stream);
    await Promise.resolve();
    expect(mock.tracks[0].stop).toHaveBeenCalledOnce();
    expect(mock.MockRecorder.instances).toHaveLength(0);
  });

  it("measures actual filtered inputs without a speaker connection and hands back dry audio", async () => {
    const mock = inputAudioMocks();
    const input = await openInputAudio(new AbortController().signal, mock.env);
    const context = mock.MockContext.instances[0];
    expect(context.createIIRFilter).toHaveBeenCalledTimes(4);
    for (const c of Object.values(subBandSections(context.sampleRate)))
      expect(context.createIIRFilter).toHaveBeenCalledWith(
        [c.b0, c.b1, c.b2],
        [1, c.a1, c.a2],
      );
    expect(
      mock.nodes
        .flatMap((node) => node.connect.mock.calls)
        .some(([target]) => target === context.destination),
    ).toBe(false);
    expect(mock.getUserMedia).toHaveBeenCalledWith({
      video: false,
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(input.sample()).toEqual({
      level: 0.25,
      low: 0.25,
      mid: 0.25,
      high: 0.25,
      sub: 0.25,
    });
    input.start();
    const recorder = mock.MockRecorder.instances[0];
    recorder.ondataavailable!({ data: new Blob(["recorded audio"]) });
    input.stop();
    const blob = await input.done;
    expect(blob.size).toBe(14);
    expect(blob.type).toBe(recorder.mimeType);
    expect(mock.tracks[0].stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(
      mock.nodes
        .filter((node) => node !== context.destination)
        .every((node) => node.disconnect.mock.calls.length === 1),
    ).toBe(true);
  });

  it("also cancels a context that remains suspended after the input permission resolves", async () => {
    const mock = inputAudioMocks(),
      abort = new AbortController();
    class SuspendedContext extends mock.MockContext {
      resume = vi.fn(() => new Promise<void>(() => {}));
    }
    mock.env.Context = SuspendedContext as unknown as typeof AudioContext;
    const opening = openInputAudio(abort.signal, mock.env);
    await Promise.resolve();
    await Promise.resolve();
    abort.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(mock.MockContext.instances[0].close).toHaveBeenCalledOnce();
    expect(mock.tracks[0].stop).toHaveBeenCalledOnce();
  });

  it.each(["cancel", "error", "overflow"] as const)(
    "releases every device on %s and refuses a partial recording",
    async (failure) => {
      const mock = inputAudioMocks();
      const input = await openInputAudio(
        new AbortController().signal,
        mock.env,
      );
      input.start();
      const recorder = mock.MockRecorder.instances[0];
      if (failure === "cancel") input.cancel();
      else if (failure === "error") recorder.onerror!();
      else
        recorder.ondataavailable!({
          data: { size: INPUT_AUDIO_LIMIT + 1 } as Blob,
        });
      await expect(input.done).rejects.toThrow(
        failure === "overflow"
          ? /32 MB/
          : failure === "cancel"
            ? /cancelled/
            : /failed/,
      );
      expect(mock.tracks[0].stop).toHaveBeenCalledOnce();
      expect(mock.MockContext.instances[0].close).toHaveBeenCalledOnce();
      expect(recorder.stop).toHaveBeenCalledOnce();
    },
  );
});
