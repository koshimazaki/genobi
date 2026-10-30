// Prewarm keeps one worker at a time, and a discarded recording frees it.
// The status check is held open so each race can be arranged exactly.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../server/errors";
import { VoiceService, voiceConfig, type VoiceStatus } from "../server/voice";
import type { VoiceWorker, WorkerResult } from "../server/voice-process";
import { wav } from "./audio-fixtures";

const READY: VoiceStatus = {
  available: true,
  python: true,
  model: true,
  ffmpeg: true,
  maxSeconds: 180,
  languages: ["auto", "English"],
};
const RESULT: WorkerResult = {
  segments: [{ start: 0, end: 3, text: "pan left" }],
  language: "English",
  inferSeconds: 0.1,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const services: VoiceService[] = [];
afterEach(() => services.splice(0).forEach((service) => service.close()));

const tone = () =>
  Float32Array.from(
    { length: 48_000 },
    (_, i) => Math.sin((2 * Math.PI * 220 * i) / 16_000) * 0.2,
  );

/**
 * A service whose workers are counted; `hold` keeps a run open and `decode`
 * stands in for ffmpeg.
 */
function service(
  hold?: Promise<void>,
  decode: () => Promise<Float32Array> = async () => tone(),
) {
  const workers: { killed: boolean }[] = [];
  const voice = new VoiceService({
    config: { ...voiceConfig({}), python: "/py", model: "/model" },
    decode,
    start: (): VoiceWorker => {
      const record = { killed: false };
      workers.push(record);
      return {
        ready: Promise.resolve({ model: "Stand-in", loadSeconds: 0 }),
        async run() {
          await hold;
          return RESULT;
        },
        kill: () => void (record.killed = true),
      };
    },
  });
  services.push(voice);
  const alive = () => workers.filter((w) => !w.killed).length;
  return { voice, workers, alive };
}
/** The first status call waits for `held`; later ones answer at once. */
function holdStatus(voice: VoiceService) {
  const held = deferred<VoiceStatus>();
  vi.spyOn(voice, "status")
    .mockImplementationOnce(() => held.promise)
    .mockResolvedValue(READY);
  return held;
}
const signal = () => new AbortController().signal;

describe("prewarm", () => {
  it("does not start a second worker for a transcription that began meanwhile", async () => {
    const run = deferred<void>();
    const { voice, workers, alive } = service(run.promise);
    const held = holdStatus(voice);
    const prewarm = voice.prewarm();
    const transcription = voice.transcribe(
      Buffer.from(wav(3)),
      "audio/wav",
      signal(),
    );
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    held.resolve(READY);
    expect(await prewarm).toEqual({ warming: false });
    expect(workers).toHaveLength(1);
    run.resolve();
    expect((await transcription).text).toBe("pan left");
    expect(alive()).toBe(0);
  });

  it("does not start a second worker when another prewarm won", async () => {
    const { voice, workers } = service();
    const held = holdStatus(voice);
    const first = voice.prewarm();
    expect(await voice.prewarm()).toEqual({ warming: true });
    held.resolve(READY);
    expect(await first).toEqual({ warming: true });
    expect(workers).toHaveLength(1);
  });

  it("stands down when the recording was discarded during the status check", async () => {
    const { voice, workers } = service();
    const held = holdStatus(voice);
    const prewarm = voice.prewarm();
    expect(voice.cancelPrewarm()).toEqual({ stopped: false });
    held.resolve(READY);
    expect(await prewarm).toEqual({ warming: false });
    expect(workers).toHaveLength(0);
  });
});

describe("cancelling a prewarm", () => {
  it("stops the waiting worker, leaving none, and the next note starts afresh", async () => {
    const { voice, workers, alive } = service();
    vi.spyOn(voice, "status").mockResolvedValue(READY);
    expect(await voice.prewarm()).toEqual({ warming: true });
    expect(alive()).toBe(1);
    expect(voice.cancelPrewarm()).toEqual({ stopped: true });
    expect(alive()).toBe(0);
    const result = await voice.transcribe(
      Buffer.from(wav(3)),
      "audio/wav",
      signal(),
    );
    expect(result.timing.prewarmed).toBe(false);
    expect(workers).toHaveLength(2);
    expect(alive()).toBe(0);
  });
});

describe("a note that fails early", () => {
  /** A service with a warm worker, ready for one note. */
  async function prewarmed(
    decode?: () => Promise<Float32Array>,
    hold?: Promise<void>,
  ) {
    const made = service(hold, decode);
    vi.spyOn(made.voice, "status").mockResolvedValue(READY);
    await made.voice.prewarm();
    expect(made.alive()).toBe(1);
    return made;
  }

  it("frees the prewarm when the note is silent", async () => {
    const { voice, workers, alive } = await prewarmed(
      async () => new Float32Array(48_000),
    );
    await expect(
      voice.transcribe(Buffer.from(wav(3)), "audio/wav", signal()),
    ).rejects.toMatchObject({ code: "no_speech" });
    expect(workers).toHaveLength(1);
    expect(alive()).toBe(0);
  });

  it("frees the prewarm when the audio cannot be decoded", async () => {
    const { voice, alive } = await prewarmed(async () => {
      throw new AppError(422, "Undecodable.", "voice_decode_failed");
    });
    await expect(
      voice.transcribe(Buffer.from(wav(3)), "audio/wav", signal()),
    ).rejects.toMatchObject({ code: "voice_decode_failed" });
    expect(alive()).toBe(0);
  });

  it("frees the prewarm when the upload is refused", async () => {
    const { voice, alive } = await prewarmed();
    await expect(
      voice.transcribe(Buffer.from(wav(3)), "audio/webm", signal()),
    ).rejects.toMatchObject({ code: "voice_type" });
    expect(alive()).toBe(0);
  });

  it("leaves a running note's worker alone when a second note is turned away", async () => {
    const decoding = deferred<Float32Array>();
    const { voice, workers, alive } = await prewarmed(() => decoding.promise);
    const first = voice.transcribe(Buffer.from(wav(3)), "audio/wav", signal());
    await vi.waitFor(() =>
      expect(vi.mocked(voice.status)).toHaveBeenCalledTimes(2),
    );
    await expect(
      voice.transcribe(Buffer.from(wav(3)), "audio/wav", signal()),
    ).rejects.toMatchObject({ code: "voice_busy" });
    expect(alive()).toBe(1);
    decoding.resolve(tone());
    expect((await first).timing.prewarmed).toBe(true);
    expect(workers).toHaveLength(1);
  });
});
