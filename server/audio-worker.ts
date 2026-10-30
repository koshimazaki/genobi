import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  gridWithEvidence,
  MAX_ONSETS,
  ms,
  type LibrosaPart,
} from "../shared/audio-report";
import { WorkerError } from "./voice-process";

/**
 * The optional librosa worker (server/audio-worker/audio_worker.py): one
 * process per request. The server writes one header line, then the samples
 * as little-endian float32 on stdin; no path crosses. The worker prints one
 * `result` or `error` line and exits. Its stderr is discarded, because
 * library output there can name local paths.
 */
export interface AudioWorkerCommand {
  python: string;
  script: string;
}
export type RunAudioWorker = (
  command: AudioWorkerCommand,
  samples: Float32Array,
  sampleRate: number,
  timeoutMs: number,
) => Promise<Record<string, unknown>>;

/** A report holds a few thousand numbers; more is not a result. */
const MAX_OUTPUT = 4 * 1024 * 1024;

/** The worker needs no server keys: pass only what Python uses. */
const workerEnv = () => ({
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: process.env.HOME ?? "",
  LANG: process.env.LANG ?? "en_US.UTF-8",
  TMPDIR: process.env.TMPDIR ?? "/tmp",
});

function start(
  command: AudioWorkerCommand,
  args: string[],
  timeoutMs: number,
  input?: Buffer[],
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(command.python, ["-I", command.script, ...args], {
      stdio: ["pipe", "pipe", "ignore"],
      env: workerEnv(),
      windowsHide: true,
    });
    let received = 0,
      settled = false;
    const finish = (error?: WorkerError, message?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      if (error) reject(error);
      else resolve(message!);
    };
    const timer = setTimeout(
      () => finish(new WorkerError("audio_timeout")),
      timeoutMs,
    );
    createInterface({ input: child.stdout }).on("line", (line) => {
      received += line.length;
      if (received > MAX_OUTPUT)
        return finish(new WorkerError("output_too_large"));
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line);
      } catch {
        return; // Not a protocol line.
      }
      if (message?.event === "error")
        finish(
          new WorkerError(
            typeof message.code === "string" && /^\w{1,64}$/.test(message.code)
              ? message.code
              : "worker_failed",
          ),
        );
      else if (message?.event === "result" || message?.event === "ready")
        finish(undefined, message);
    });
    child.on("error", (error: NodeJS.ErrnoException) =>
      finish(
        new WorkerError(
          error.code === "ENOENT" ? "python_missing" : "spawn_failed",
        ),
      ),
    );
    child.on("close", () => finish(new WorkerError("worker_exited")));
    child.stdin.on("error", () => {}); // A worker that exited early closes its pipe.
    for (const part of input ?? []) child.stdin.write(part);
    child.stdin.end();
  });
}

export const runAudioWorker: RunAudioWorker = (
  command,
  samples,
  sampleRate,
  timeoutMs,
) =>
  start(command, [], timeoutMs, [
    Buffer.from(
      `${JSON.stringify({ schema: 1, sampleRate, samples: samples.length })}\n`,
    ),
    Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
  ]);

/** Whether the configured Python imports librosa: one short `--check` run. */
export const checkAudioWorker = (command: AudioWorkerCommand) =>
  start(command, ["--check"], 60_000).then(
    (message) => message.event === "ready",
    () => false,
  );

/** Finite times inside the audio in ascending order, or nothing. */
function times(value: unknown, duration: number, max: number) {
  if (!Array.isArray(value) || value.length > max) return null;
  const ordered = value.every(
    (t, i) =>
      typeof t === "number" &&
      Number.isFinite(t) &&
      t >= 0 &&
      t <= duration + 1 &&
      (i === 0 || t >= value[i - 1]),
  );
  return ordered ? (value as number[]) : null;
}

/**
 * The worker's raw beats, low-band energy per beat, band onsets and section
 * boundaries, checked and turned into the report's shapes with the same grid
 * fit and onset-evidence gate the core analysis uses.
 */
export function librosaPart(
  message: Record<string, unknown>,
  duration: number,
): LibrosaPart {
  const beats = times(message.beats, duration, 20_000);
  const energy = Array.isArray(message.beatLowEnergy)
    ? message.beatLowEnergy
    : [];
  const onsets = (message.onsets ?? {}) as Record<string, unknown>;
  const [kick, snare, hat] = ["kick", "snare", "hat"].map((band) =>
    times(onsets[band], duration, 100_000),
  );
  const sections = times(message.sections, duration, 200);
  if (
    !beats ||
    !kick ||
    !snare ||
    !hat ||
    !sections ||
    energy.length !== (message.beats as unknown[]).length ||
    !energy.every((e) => typeof e === "number" && Number.isFinite(e))
  )
    return { status: "failed", code: "invalid_result" };
  const truncated = [kick, snare, hat].some((list) => list.length > MAX_ONSETS);
  const clip = (list: number[]) => list.slice(0, MAX_ONSETS).map(ms);
  return {
    status: "used",
    ...(typeof message.version === "string" &&
    /^[\w.+-]{1,20}$/.test(message.version)
      ? { version: message.version }
      : {}),
    ...gridWithEvidence(beats, energy as number[], [...kick, ...snare, ...hat]),
    onsets: { kick: clip(kick), snare: clip(snare), hat: clip(hat), truncated },
    sections: sections.map(ms),
  };
}
