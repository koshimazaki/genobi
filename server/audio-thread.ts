import { Worker } from "node:worker_threads";
import { AudioInputError } from "../shared/audio-analysis";
import type { AudioAnalysisReport } from "../shared/audio-report";

/**
 * Runs the shared `analyseAudio` on a worker thread, so an uncached analysis
 * of a long track no longer holds the server's event loop (about 4 s for
 * twenty minutes when it ran inline). The thread runs `shared/audio-analysis.ts`
 * unchanged. One thread per analysis, started here and always stopped here;
 * `AudioAnalysis` lets one run at a time. The samples are transferred, not
 * copied, and come back with the report for the librosa worker.
 *
 * A refusal keeps its `AudioInputError`. A thread that throws, exits early,
 * runs out of time or answers in the wrong shape rejects with a plain error,
 * which the app answers as any unexpected failure (500, fixed message).
 */
export interface AnalysisThreadOptions {
  /** The thread's module; tests point it at one that crashes or hangs. */
  entry?: URL;
  /** Milliseconds before the thread is stopped, from the audio's length. */
  timeoutMs?: (seconds: number) => number;
}

export interface ThreadResult {
  report: AudioAnalysisReport;
  samples: Float32Array;
}

const ENTRY = new URL("./audio-thread-entry.mjs", import.meta.url);
const REFUSALS = new Set(["audio_too_short", "audio_not_finite"]);

/** Twenty minutes took 4.3 s on an M1 Max; this allows about 35 times that. */
export const threadTimeoutMs = (seconds: number) => 30_000 + seconds * 100;

export class AnalysisThread {
  private readonly running = new Set<Worker>();
  private closed = false;

  constructor(private readonly options: AnalysisThreadOptions = {}) {}

  run(samples: Float32Array, sampleRate: number) {
    return new Promise<ThreadResult>((resolve, reject) => {
      if (this.closed) return reject(stopped());
      // Measured before the transfer below empties the array.
      const seconds = samples.length / sampleRate;
      // Only a buffer the array owns whole is transferred.
      const own =
        samples.byteOffset === 0 &&
        samples.byteLength === samples.buffer.byteLength
          ? samples
          : samples.slice();
      const worker = new Worker(this.options.entry ?? ENTRY, {
        workerData: { samples: own, sampleRate },
        transferList: [own.buffer as ArrayBuffer],
      });
      this.running.add(worker);
      let settled = false;
      const finish = (error?: Error, result?: ThreadResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.running.delete(worker);
        void worker.terminate();
        if (error) reject(error);
        else resolve(result!);
      };
      const timeout = (this.options.timeoutMs ?? threadTimeoutMs)(seconds);
      const timer = setTimeout(() => finish(stopped()), timeout);
      worker.once("message", (message: unknown) => {
        const reply = parse(message);
        if (!reply) finish(stopped());
        else if ("refused" in reply)
          finish(
            new AudioInputError(reply.refused.code, reply.refused.message),
          );
        else finish(undefined, reply);
      });
      worker.once("messageerror", () => finish(stopped()));
      worker.once("error", () => finish(stopped()));
      worker.once("exit", () => finish(stopped()));
    });
  }

  /** Stops every running thread; their requests fail rather than hang. */
  async close() {
    this.closed = true;
    await Promise.all([...this.running].map((worker) => worker.terminate()));
  }
}

type Refused = {
  refused: { code: AudioInputError["code"]; message: string };
};

function parse(message: unknown): ThreadResult | Refused | undefined {
  if (!message || typeof message !== "object") return undefined;
  const reply = message as Record<string, unknown>;
  if (!(reply.samples instanceof Float32Array)) return undefined;
  const refused = reply.refused as Record<string, unknown> | undefined;
  if (refused && typeof refused === "object")
    return typeof refused.code === "string" &&
      REFUSALS.has(refused.code) &&
      typeof refused.message === "string"
      ? (reply as Refused)
      : undefined;
  return reply.report && typeof reply.report === "object"
    ? (reply as unknown as ThreadResult)
    : undefined;
}

/** No detail leaves the server: the route answers with its fixed 500. */
const stopped = () => new Error("The audio analysis thread stopped.");
