import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/**
 * One voice worker process (server/voice-worker/voice_worker.py) and its
 * line protocol: it prints `ready` once the model is loaded and warm, takes
 * one request on stdin, prints `result` or `error`, and exits. Its stderr is
 * discarded, because library output there can name local paths; only the
 * fixed codes on stdout reach the service.
 */
export interface WorkerReady {
  model: string;
  loadSeconds: number;
}
export interface WorkerSegment {
  start: number;
  end: number;
  text: string;
}
export interface WorkerResult {
  segments: WorkerSegment[];
  language: string | null;
  inferSeconds: number;
}
export interface WorkerRequest {
  schema: 1;
  pcmPath: string;
  chunks: [number, number][];
  context: string;
  /** A listed language name, or null to detect; absent: the CLI default. */
  language?: string | null;
}
export interface VoiceWorker {
  ready: Promise<WorkerReady>;
  run(request: WorkerRequest): Promise<WorkerResult>;
  kill(): void;
}
export interface WorkerCommand {
  python: string;
  script: string;
  model: string;
  language?: string;
}
export type StartWorker = (command: WorkerCommand) => VoiceWorker;

/** A failure the worker reported, or `worker_exited` when it simply stopped. */
export class WorkerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Stdout beyond this is not a transcript the studio can use. */
const MAX_OUTPUT = 2 * 1024 * 1024;

export const startWorker: StartWorker = (command) => {
  const args = ["-I", command.script, "--model", command.model];
  if (command.language) args.push("--language", command.language);
  const child = spawn(command.python, args, {
    stdio: ["pipe", "pipe", "ignore"],
    // The worker needs no server keys: pass only what Python and Metal use.
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "",
      LANG: process.env.LANG ?? "en_US.UTF-8",
      TMPDIR: process.env.TMPDIR ?? "/tmp",
    },
    windowsHide: true,
  });
  let received = 0;
  const lines = createInterface({ input: child.stdout });
  type Waiter = {
    resolve: (message: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  };
  const waiting: Record<"ready" | "result", Waiter[]> = {
    ready: [],
    result: [],
  };
  let failure: WorkerError | undefined;
  const fail = (error: WorkerError) => {
    failure ??= error;
    for (const list of Object.values(waiting))
      list.splice(0).forEach((w) => w.reject(failure!));
  };
  const seen: Partial<Record<"ready" | "result", Record<string, unknown>>> = {};
  lines.on("line", (line) => {
    received += line.length;
    if (received > MAX_OUTPUT) {
      fail(new WorkerError("output_too_large"));
      child.kill("SIGKILL");
      return;
    }
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line);
    } catch {
      return; // Not a protocol line.
    }
    if (message.event === "error")
      return fail(
        new WorkerError(
          typeof message.code === "string" && /^\w{1,64}$/.test(message.code)
            ? message.code
            : "worker_failed",
        ),
      );
    if (message.event === "ready" || message.event === "result") {
      seen[message.event] = message;
      waiting[message.event].splice(0).forEach((w) => w.resolve(message));
    }
  });
  child.on("error", (error: NodeJS.ErrnoException) =>
    fail(
      new WorkerError(
        error.code === "ENOENT" ? "python_missing" : "spawn_failed",
      ),
    ),
  );
  child.on("close", () => fail(new WorkerError("worker_exited")));
  child.stdin.on("error", () => {}); // A worker that exited early closes its pipe.
  const wait = (event: "ready" | "result") =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      if (seen[event]) resolve(seen[event]);
      else if (failure) reject(failure);
      else waiting[event].push({ resolve, reject });
    });
  const ready = wait("ready").then((m) => ({
    model: typeof m.model === "string" ? m.model.slice(0, 80) : "Qwen3-ASR",
    loadSeconds: Number(m.loadSeconds) || 0,
  }));
  ready.catch(() => {}); // Observed by `run`; an unused prewarm may fail quietly.
  return {
    ready,
    async run(request) {
      await ready;
      child.stdin.end(`${JSON.stringify(request)}\n`);
      const message = await wait("result");
      return parseResult(message);
    },
    kill() {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGTERM");
    },
  };
};

/** Only well-formed segments leave the worker's output. */
function parseResult(message: Record<string, unknown>): WorkerResult {
  const segments = Array.isArray(message.segments) ? message.segments : [];
  return {
    segments: segments.flatMap((s: Record<string, unknown>) =>
      typeof s?.text === "string" &&
      Number.isFinite(s.start) &&
      Number.isFinite(s.end)
        ? [{ start: Number(s.start), end: Number(s.end), text: s.text }]
        : [],
    ),
    language:
      typeof message.language === "string"
        ? message.language.slice(0, 40)
        : null,
    inferSeconds: Number(message.inferSeconds) || 0,
  };
}
