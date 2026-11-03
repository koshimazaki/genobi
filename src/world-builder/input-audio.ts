import type { ModSource } from "./mod-routes";
import { subBandSections } from "./audio-bands";

export type InputSignals = Record<ModSource, number>;
export const INPUT_AUDIO_LIMIT = 32 * 1024 * 1024;
export interface InputAudio {
  start(): void;
  sample(): InputSignals;
  stop(): void;
  cancel(): void;
  done: Promise<Blob>;
}
export interface InputAudioEnvironment {
  secure: boolean;
  devices?: Pick<MediaDevices, "getUserMedia">;
  Context?: typeof AudioContext;
  Recorder?: typeof MediaRecorder;
}

function environment(): InputAudioEnvironment {
  return {
    secure: globalThis.isSecureContext === true,
    devices: globalThis.navigator?.mediaDevices,
    Context: globalThis.AudioContext,
    Recorder: globalThis.MediaRecorder,
  };
}

/** Capability inspection only; it never requests a device or starts a context. */
export function inputAudioUnavailable(env = environment()): string | undefined {
  if (!env.secure)
    return "Synth input needs HTTPS or localhost. Load an audio file in this preview.";
  if (!env.devices?.getUserMedia || !env.Context || !env.Recorder)
    return "This browser cannot record audio input. Load an audio file instead.";
  return undefined;
}

const cancelled = () =>
  new DOMException("Audio input cancelled.", "AbortError");

/** User-initiated dry input, with no speaker connection or background monitoring. */
export async function openInputAudio(
  signal: AbortSignal,
  env = environment(),
): Promise<InputAudio> {
  const reason = inputAudioUnavailable(env);
  if (reason) throw new Error(reason);
  if (signal.aborted) throw cancelled();
  const context = new env.Context!({ sampleRate: 48000 });
  let stream: MediaStream | undefined;
  const nodes: AudioNode[] = [];
  let closed = false;
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    nodes.forEach((node) => node.disconnect());
    stream?.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => {});
  };
  let cancelPending: (() => void) | undefined;
  try {
    // Resume while still in the Record button's gesture; permission can resolve later.
    const resumed = context.resume();
    void resumed.catch(() => {});
    const requested = env.devices!.getUserMedia({
      video: false,
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    void requested.then(
      (late) => {
        if (signal.aborted) late.getTracks().forEach((track) => track.stop());
      },
      () => {},
    );
    const aborted = new Promise<never>((_, reject) => {
      cancelPending = () => reject(cancelled());
      if (signal.aborted) cancelPending();
      else signal.addEventListener("abort", cancelPending, { once: true });
    });
    stream = await Promise.race([requested, aborted]);
    await Promise.race([resumed, aborted]);
    if (signal.aborted) throw cancelled();
    const source = context.createMediaStreamSource(stream);
    nodes.push(source);
    const meter = (input: AudioNode) => {
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      input.connect(analyser);
      nodes.push(analyser);
      const samples = new Float32Array(analyser.fftSize);
      return () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) sum += value * value;
        return Math.min(1, Math.sqrt(sum / samples.length));
      };
    };
    const lowpass = (hz: number) => {
      const a = 1 - Math.exp((-2 * Math.PI * hz) / context.sampleRate);
      const filter = context.createIIRFilter([a], [1, -(1 - a)]);
      source.connect(filter);
      nodes.push(filter);
      return filter;
    };
    const subtract = (positive: AudioNode, negative: AudioNode) => {
      const sum = context.createGain(),
        inverse = context.createGain();
      inverse.gain.value = -1;
      positive.connect(sum);
      negative.connect(inverse).connect(sum);
      nodes.push(sum, inverse);
      return sum;
    };
    const lower = lowpass(200),
      upper = lowpass(2000);
    const sections = subBandSections(context.sampleRate);
    const subFilter = (c: typeof sections.highpass) =>
      context.createIIRFilter([c.b0, c.b1, c.b2], [1, c.a1, c.a2]);
    const highpass = subFilter(sections.highpass),
      subpass = subFilter(sections.lowpass);
    source.connect(highpass).connect(subpass);
    nodes.push(highpass, subpass);
    const meters = {
      level: meter(source),
      low: meter(lower),
      mid: meter(subtract(upper, lower)),
      high: meter(subtract(source, upper)),
      sub: meter(subpass),
    };
    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ].find((mime) => env.Recorder!.isTypeSupported(mime));
    const recorder = new env.Recorder!(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 128_000,
    });
    const chunks: Blob[] = [];
    let bytes = 0,
      started = false,
      ended = false,
      failure: Error | undefined;
    let resolve!: (blob: Blob) => void, reject!: (error: Error) => void;
    const done = new Promise<Blob>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void done.catch(() => {});
    const finish = async () => {
      if (ended) return;
      ended = true;
      signal.removeEventListener("abort", abort);
      await cleanup();
      if (failure) reject(failure);
      else if (!bytes)
        reject(new Error("No audio was recorded. Try a longer input take."));
      else
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };
    const stop = () => {
      if (recorder.state !== "inactive") recorder.stop();
      else void finish();
    };
    const abort = () => {
      failure = cancelled();
      stop();
      void cleanup();
    };
    recorder.ondataavailable = ({ data }) => {
      bytes += data.size;
      if (bytes <= INPUT_AUDIO_LIMIT) chunks.push(data);
      else {
        failure = new Error("Audio input exceeded 32 MB.");
        stop();
      }
    };
    recorder.onerror = () => {
      failure = new Error("Audio input recording failed.");
      stop();
    };
    recorder.onstop = () => {
      void finish();
    };
    signal.addEventListener("abort", abort, { once: true });
    return {
      start() {
        if (started || closed)
          throw new Error("Audio input is no longer ready.");
        started = true;
        try {
          recorder.start(100);
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          void finish();
          throw error;
        }
      },
      sample: () =>
        Object.fromEntries(
          Object.entries(meters).map(([key, read]) => [key, read()]),
        ) as InputSignals,
      stop,
      cancel: abort,
      done,
    };
  } catch (error) {
    await cleanup();
    throw error;
  } finally {
    if (cancelPending) signal.removeEventListener("abort", cancelPending);
  }
}
