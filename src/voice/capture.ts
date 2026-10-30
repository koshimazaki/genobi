import type { VoiceLanguage } from "../../shared/voice-languages";
import { cancelPrewarm, transcribe, type Transcript } from "./api";
import { recordingToWav } from "./wav";

/**
 * The two steps of a voice note that can fail between the server's prewarm
 * and its transcription, kept apart from React so the tests can run them
 * with stand-ins for the browser's audio objects.
 */
export interface CaptureEnv {
  createContext: () => AudioContext;
  createRecorder: (stream: MediaStream) => MediaRecorder;
}
const browser: CaptureEnv = {
  createContext: () => new AudioContext(),
  createRecorder: (stream) => new MediaRecorder(stream),
};

export interface Capture {
  context: AudioContext;
  analyser: AnalyserNode;
  recorder: MediaRecorder;
}

/**
 * The level meter and a running recorder over a granted microphone. If any
 * step throws, the tracks are stopped and a created context is closed before
 * the error is rethrown: nothing else holds the stream yet, so no later
 * cleanup could find it.
 */
export function openCapture(
  stream: MediaStream,
  env: CaptureEnv = browser,
): Capture {
  let context: AudioContext | undefined;
  try {
    context = env.createContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const recorder = env.createRecorder(stream);
    recorder.start(250);
    return { context, analyser, recorder };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    try {
      void context?.close().catch(() => {});
    } catch {
      /* Already closed. */
    }
    throw error;
  }
}

export interface DeliverEnv {
  toWav: (recording: Blob, maxSeconds: number) => Promise<Blob>;
  send: (
    wav: Blob,
    signal: AbortSignal,
    language: VoiceLanguage,
  ) => Promise<Transcript>;
  cancelPrewarm: () => void;
}
const network: DeliverEnv = {
  toWav: recordingToWav,
  send: transcribe,
  cancelPrewarm,
};

/**
 * Converts one recording to WAV and sends it. A recording that cannot be
 * decoded (too short, or malformed) never reaches the server, so the worker
 * its prewarm started is freed here; a note that reaches the server and
 * fails is freed there.
 */
export async function deliverNote(
  recording: Blob,
  maxSeconds: number,
  signal: AbortSignal,
  language: VoiceLanguage,
  env: DeliverEnv = network,
): Promise<Transcript> {
  let wav: Blob;
  try {
    wav = await env.toWav(recording, maxSeconds);
  } catch (error) {
    env.cancelPrewarm();
    throw error;
  }
  return env.send(wav, signal, language);
}
