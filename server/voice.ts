import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectUpload, UPLOAD_LIMITS, uploadType } from "../shared/uploads";
import {
  cleanTranscript,
  dictionaryContext,
  STUDIO_DICTIONARY,
  stripContextEcho,
} from "../shared/voice-dictionary";
import {
  configuredVoiceLanguage,
  parseVoiceLanguage,
  VOICE_LANGUAGES,
  type VoiceLanguage,
} from "../shared/voice-languages";
import { AppError } from "./errors";
import { planChunks, readFloat32, SAMPLE_RATE } from "./voice-audio";
import {
  startWorker,
  WorkerError,
  type StartWorker,
  type VoiceWorker,
} from "./voice-process";

/**
 * Voice mode on the local server: speech in, prompt text out, nothing leaves
 * the machine. One request is one worker run: validate and measure the audio,
 * decode it with ffmpeg to 16 kHz mono, cut 28-second chunks, drop silent
 * ones, let Qwen3-ASR transcribe the rest, then apply the studio dictionary
 * and number normalisation. The hosted Worker has no voice route.
 *
 * Startup configuration reads environment variables and the private installer
 * settings; guided setup can replace the worker configuration in-process:
 * GENOBI_VOICE_PYTHON (a Python with server/voice-worker/requirements.txt),
 * GENOBI_VOICE_MODEL (a local Qwen3-ASR folder) and, optionally,
 * GENOBI_VOICE_LANGUAGE (the hint used when a request names none, such as
 * English; unset means detect). Each transcription may name its own language
 * from shared/voice-languages.ts. ffmpeg is FFMPEG_PATH or the one on PATH,
 * as for the media tools. Paths are never logged or sent.
 */
export const MAX_VOICE_SECONDS = 180;
/** A prewarmed worker waits this long for its recording, then stops. */
const PREWARM_MS = (MAX_VOICE_SECONDS + 60) * 1000;
const LOAD_TIMEOUT_MS = 180_000;
const DECODE_TIMEOUT_MS = 60_000;
const SETUP = "See docs/voice-mode.md, then restart the server.";

export interface VoiceConfig {
  python?: string;
  model?: string;
  language?: string;
  ffmpeg: string;
  script: string;
}

export function voiceConfig(env: NodeJS.ProcessEnv = process.env): VoiceConfig {
  const value = (name: string) => env[name]?.trim() || undefined;
  return {
    python: value("GENOBI_VOICE_PYTHON"),
    model: value("GENOBI_VOICE_MODEL"),
    language: value("GENOBI_VOICE_LANGUAGE"),
    ffmpeg: value("FFMPEG_PATH") ?? "ffmpeg",
    script: path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "voice-worker",
      "voice_worker.py",
    ),
  };
}

export interface VoiceStatus {
  available: boolean;
  python: boolean;
  model: boolean;
  ffmpeg: boolean;
  maxSeconds: number;
  /** The language hints a transcription may name, and `auto`. */
  languages: string[];
  /** The hint used when a request names none: GENOBI_VOICE_LANGUAGE. */
  language?: VoiceLanguage;
  /** What to install or set when something is missing. */
  setup?: string;
}

export interface VoiceOptions {
  config?: VoiceConfig;
  start?: StartWorker;
  /** Decodes audio to 16 kHz mono float32; tests inject one. */
  decode?: (audio: Buffer, ffmpeg: string) => Promise<Float32Array>;
}

const executable = (file?: string) =>
  !!file && path.isAbsolute(file)
    ? access(file, constants.X_OK).then(
        () => true,
        () => false,
      )
    : Promise.resolve(false);

/** ffmpeg's `f32le` output at 16 kHz mono, bounded while it is written. */
export function decodeWithFfmpeg(audio: Buffer, ffmpeg: string) {
  const limit = (MAX_VOICE_SECONDS + 1) * SAMPLE_RATE * 4;
  return new Promise<Float32Array>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        ...["-nostdin", "-hide_banner", "-loglevel", "error"],
        ...["-i", "pipe:0", "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE)],
        ...["-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"],
      ],
      { stdio: ["pipe", "pipe", "ignore"], windowsHide: true },
    );
    const parts: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), DECODE_TIMEOUT_MS);
    child.stdout.on("data", (part: Buffer) => {
      size += part.length;
      if (size > limit) child.kill("SIGKILL");
      else parts.push(part);
    });
    child.stdin.on("error", () => {});
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        error.code === "ENOENT"
          ? new AppError(
              503,
              `Voice mode needs ffmpeg. ${SETUP}`,
              "ffmpeg_missing",
            )
          : error,
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && size <= limit)
        resolve(readFloat32(new Uint8Array(Buffer.concat(parts))));
      else
        reject(
          new AppError(
            422,
            "This audio could not be decoded.",
            "voice_decode_failed",
          ),
        );
    });
    child.stdin.end(audio);
  });
}

const WORKER_MESSAGES: Record<string, [number, string]> = {
  python_missing: [503, `The voice Python could not start. ${SETUP}`],
  packages_missing: [503, `The voice Python lacks qwen-asr. ${SETUP}`],
  local_model_missing: [503, `The voice model folder is missing. ${SETUP}`],
  voice_timeout: [504, "Transcription took too long and was stopped."],
  cancelled: [499, "Transcription was cancelled."],
};

export class VoiceService {
  config: VoiceConfig;
  private readonly start: StartWorker;
  private readonly decode: NonNullable<VoiceOptions["decode"]>;
  private ffmpegFound?: Promise<boolean>;
  private warm?: { worker: VoiceWorker; timer: NodeJS.Timeout };
  private busy = false;
  /** Bumped by `cancelPrewarm`, so a prewarm awaiting status stands down. */
  private prewarms = 0;

  constructor(options: VoiceOptions = {}) {
    this.config = options.config ?? voiceConfig();
    this.start = options.start ?? startWorker;
    this.decode = options.decode ?? decodeWithFfmpeg;
  }

  configure(config: VoiceConfig) {
    if (this.busy)
      throw new AppError(409, "Wait for the current transcription to finish.");
    this.cancelPrewarm();
    this.config = config;
    this.ffmpegFound = undefined;
  }

  async checkConfiguration(config: VoiceConfig, signal: AbortSignal) {
    const worker = this.start({
      python: config.python!,
      model: config.model!,
      script: config.script,
    });
    const stop = () => worker.kill();
    signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, LOAD_TIMEOUT_MS);
    try {
      if (signal.aborted) throw new Error("Installation cancelled.");
      await worker.ready;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      worker.kill();
    }
  }

  async status(): Promise<VoiceStatus> {
    const { python, model, ffmpeg } = this.config;
    this.ffmpegFound ??= new Promise((resolve) =>
      execFile(ffmpeg, ["-version"], { timeout: 10_000 }, (error) =>
        resolve(!error),
      ),
    );
    const [hasPython, hasModel, hasScript, hasFfmpeg] = await Promise.all([
      executable(python),
      model && path.isAbsolute(model)
        ? stat(path.join(model, "config.json")).then(
            (s) => s.isFile(),
            () => false,
          )
        : false,
      access(this.config.script, constants.R_OK).then(
        () => true,
        () => false,
      ),
      this.ffmpegFound,
    ]);
    const language = configuredVoiceLanguage(this.config.language);
    const missing = [
      !hasPython &&
        "set GENOBI_VOICE_PYTHON to a Python with server/voice-worker/requirements.txt installed",
      !hasModel && "set GENOBI_VOICE_MODEL to a local Qwen3-ASR model folder",
      !hasFfmpeg && "install ffmpeg (or set FFMPEG_PATH)",
      !hasScript && "restore server/voice-worker/voice_worker.py",
      !language &&
        "set GENOBI_VOICE_LANGUAGE to a listed language or auto, or leave it unset",
    ].filter(Boolean);
    return {
      available: !missing.length,
      python: hasPython,
      model: hasModel,
      ffmpeg: hasFfmpeg,
      maxSeconds: MAX_VOICE_SECONDS,
      languages: ["auto", ...VOICE_LANGUAGES],
      ...(language ? { language } : {}),
      ...(missing.length
        ? { setup: `Voice mode is not set up: ${missing.join("; ")}. ${SETUP}` }
        : {}),
    };
  }

  /**
   * Loads the model while the person is still speaking. At most one worker
   * exists: the checks repeat after the awaited status, because a
   * transcription or a cancel may have arrived meanwhile.
   */
  async prewarm() {
    const settled = () => this.warm || this.busy;
    if (settled()) return { warming: !!this.warm };
    const epoch = this.prewarms;
    const { available } = await this.status();
    if (!available || settled() || epoch !== this.prewarms)
      return { warming: !!this.warm };
    const worker = this.spawn();
    const timer = setTimeout(() => this.release(worker), PREWARM_MS);
    timer.unref();
    this.warm = { worker, timer };
    worker.ready.catch(() => this.release(worker));
    return { warming: true };
  }

  /**
   * A discarded recording: stops the waiting worker, and any prewarm still
   * checking the status will not start one. A worker a transcription has
   * already taken is left to that transcription.
   */
  cancelPrewarm() {
    this.prewarms++;
    const stopped = !!this.warm;
    if (this.warm) this.release(this.warm.worker);
    return { stopped };
  }

  private spawn() {
    return this.start({
      python: this.config.python!,
      script: this.config.script,
      model: this.config.model!,
    });
  }

  private release(worker: VoiceWorker) {
    if (this.warm?.worker !== worker) return;
    clearTimeout(this.warm.timer);
    this.warm = undefined;
    worker.kill();
  }

  /** Stops a waiting worker; the server calls this on shutdown. */
  close() {
    if (this.warm) this.release(this.warm.worker);
  }

  /**
   * Refuses a wrong type, an oversized or overlong upload and an unconfigured
   * machine before anything is spawned. Whenever the note fails, its prewarmed
   * worker is freed rather than left holding the model.
   */
  async transcribe(
    audio: unknown,
    contentType: string | undefined,
    signal: AbortSignal,
    language?: unknown,
  ) {
    try {
      return await this.attempt(audio, contentType, signal, language);
    } catch (error) {
      // A refused, silent or undecodable note will not use the worker its
      // recording prewarmed, and the studio sends no cancel after a failed
      // request, so free it here. While another note is running (busy), a
      // waiting worker is that note's, and stays.
      if (!this.busy) this.cancelPrewarm();
      throw error;
    }
  }

  private async attempt(
    audio: unknown,
    contentType: string | undefined,
    signal: AbortSignal,
    language: unknown,
  ) {
    let asked: VoiceLanguage | undefined;
    try {
      asked = parseVoiceLanguage(language);
    } catch (error) {
      throw new AppError(400, (error as Error).message, "voice_language");
    }
    const type = uploadType(contentType);
    if (type?.kind !== "audio" || !Buffer.isBuffer(audio))
      throw new AppError(
        415,
        "Send the voice note as WAV, FLAC or MP3 audio.",
        "voice_type",
      );
    if (audio.length === 0 || audio.length > UPLOAD_LIMITS.audio)
      throw new AppError(
        413,
        "The voice note is too large.",
        "voice_too_large",
      );
    let duration;
    try {
      ({ duration } = await inspectUpload(
        type,
        audio.length,
        async (at, length) =>
          new Uint8Array(audio.subarray(at, at + length)).buffer,
      ));
    } catch (error) {
      throw new AppError(400, (error as Error).message, "voice_unreadable");
    }
    if (duration > MAX_VOICE_SECONDS)
      throw new AppError(
        413,
        "Keep a voice note under three minutes.",
        "voice_too_long",
      );
    const status = await this.status();
    if (!status.available)
      throw new AppError(503, status.setup!, "voice_not_configured");
    if (this.busy)
      throw new AppError(
        409,
        "A transcription is already running.",
        "voice_busy",
      );
    // A request without a language takes the server's (checked by status).
    const hint = asked ?? configuredVoiceLanguage(this.config.language)!;
    this.busy = true;
    try {
      return await this.run(audio, duration, signal, hint);
    } finally {
      this.busy = false;
    }
  }

  private async run(
    audio: Buffer,
    duration: number,
    signal: AbortSignal,
    language: VoiceLanguage,
  ) {
    const began = performance.now();
    const seconds = () =>
      Number(((performance.now() - began) / 1000).toFixed(3));
    const samples = await this.decode(audio, this.config.ffmpeg);
    const decodeSeconds = seconds();
    const chunks = planChunks(samples);
    const heard = chunks.filter((chunk) => chunk.speech);
    if (!heard.length)
      throw new AppError(
        422,
        "No speech was heard in that recording.",
        "no_speech",
      );
    // The folder first: if it cannot be made, no worker has been taken.
    const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-voice-"));
    const warm = this.warm;
    if (warm) {
      clearTimeout(warm.timer);
      this.warm = undefined;
    }
    const worker = warm?.worker ?? this.spawn();
    const timeout = LOAD_TIMEOUT_MS + 60_000 + duration * 3000;
    let timer: NodeJS.Timeout | undefined;
    let failed: (error: Error) => void = () => {};
    const stopped = new Promise<never>((_, reject) => (failed = reject));
    stopped.catch(() => {}); // Raced below; a late stop needs no handler.
    const stop = (code: string) => () => {
      worker.kill();
      failed(new WorkerError(code));
    };
    const cancel = stop("cancelled");
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const pcmPath = path.join(folder, "audio.f32");
      await writeFile(
        pcmPath,
        new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength),
        { mode: 0o600 },
      );
      timer = setTimeout(stop("voice_timeout"), timeout);
      if (signal.aborted) cancel();
      const context = dictionaryContext(STUDIO_DICTIONARY);
      const ready = await Promise.race([worker.ready, stopped]);
      const waitSeconds = seconds() - decodeSeconds;
      const result = await Promise.race([
        worker.run({
          schema: 1,
          pcmPath,
          chunks: heard.map((c) => [c.start, c.end]),
          context,
          // null: no hint, the model detects the language per chunk.
          language: language === "auto" ? null : language,
        }),
        stopped,
      ]);
      const raw = result.segments
        .map((segment) => stripContextEcho(segment.text, context))
        .filter(Boolean)
        .join(" ");
      const text = cleanTranscript(raw);
      if (!text)
        throw new AppError(
          422,
          "No speech was heard in that recording.",
          "no_speech",
        );
      return {
        text,
        heard: raw,
        language: result.language,
        model: ready.model,
        chunks: { total: chunks.length, transcribed: heard.length },
        timing: {
          audioSeconds: Number(duration.toFixed(3)),
          decodeSeconds,
          prewarmed: !!warm,
          waitSeconds: Number(waitSeconds.toFixed(3)),
          transcribeSeconds: result.inferSeconds,
          totalSeconds: seconds(),
        },
      };
    } catch (error) {
      if (error instanceof WorkerError) {
        const [status, message] = WORKER_MESSAGES[error.code] ?? [
          502,
          "The local voice worker failed.",
        ];
        throw new AppError(status, message, error.code);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      worker.kill();
      await rm(folder, { recursive: true, force: true });
    }
  }
}
