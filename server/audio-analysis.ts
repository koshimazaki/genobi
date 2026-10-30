import { constants } from "node:fs";
import { access, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AudioInputError } from "../shared/audio-analysis";
import {
  inspectAudio,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
} from "../shared/audio";
import {
  ANALYSIS_SAMPLE_RATE,
  type AudioAnalysisReport,
  type LibrosaPart,
} from "../shared/audio-report";
import { COPY_ID, DIRECTOR_ID } from "../shared/director/commands";
import type { Source } from "../shared/types";
import { AppError } from "./errors";
import { AnalysisThread, type AnalysisThreadOptions } from "./audio-thread";
import {
  checkAudioWorker,
  librosaPart,
  runAudioWorker,
  type RunAudioWorker,
} from "./audio-worker";
import type { MediaTools } from "./media-tools";
import type { ProjectCopies } from "./projects";
import { WorkerError } from "./voice-process";

/**
 * Audio analysis on the local server: an owned audio source, or an audio
 * asset of a Director project the session owns or is linked to, decoded by
 * ffmpeg to mono float32 and analysed in TypeScript on a worker thread
 * (`audio-thread.ts`), so the event loop stays free. With `librosa: true`
 * and GENOBI_AUDIO_PYTHON set, the optional librosa worker adds its view.
 * Reports are cached in memory by the file's SHA-256. The hosted Worker has
 * no audio analysis route. Paths and the Python location are never logged
 * or sent; the status route answers with booleans only.
 */
export interface AudioAnalysisOptions {
  /** Defaults to GENOBI_AUDIO_PYTHON. */
  python?: string;
  script?: string;
  /** The librosa worker; tests inject one. */
  runWorker?: RunAudioWorker;
  checkWorker?: typeof checkAudioWorker;
  /** The analysis thread's module and time limit; tests inject both. */
  thread?: AnalysisThreadOptions;
}
type Resolve = (
  id: string,
  sessionId: string,
) => Promise<{ source: Source; file: string; sha256?: string }>;
interface Target {
  file: string;
  sha256: string;
  duration: number;
}

const CACHE_ENTRIES = 64;
/** One analysis runs and three wait; a fifth request is told to retry. */
const MAX_PENDING = 4;
const SOURCE_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const KEYS = new Set(["sourceId", "copyId", "assetId", "librosa"]);

export class AudioAnalysis {
  private readonly cache = new Map<string, AudioAnalysisReport | LibrosaPart>();
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private readonly thread: AnalysisThread;
  private librosaFound?: Promise<boolean>;
  private readonly python?: string;
  private readonly script: string;
  private readonly runWorker: RunAudioWorker;
  private readonly checkWorker: typeof checkAudioWorker;

  constructor(
    private readonly tools: MediaTools,
    private readonly resolve: Resolve,
    private readonly projects: ProjectCopies,
    options: AudioAnalysisOptions = {},
  ) {
    this.python =
      options.python ?? (process.env.GENOBI_AUDIO_PYTHON?.trim() || undefined);
    this.script =
      options.script ??
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "audio-worker",
        "audio_worker.py",
      );
    this.runWorker = options.runWorker ?? runAudioWorker;
    this.checkWorker = options.checkWorker ?? checkAudioWorker;
    this.thread = new AnalysisThread(options.thread);
  }

  /** On shutdown: a running thread is stopped and its request answers 500. */
  close() {
    return this.thread.close();
  }

  /** Booleans only: whether each part is ready on this machine. */
  async status() {
    const [ffmpeg, librosa] = await Promise.all([
      this.tools.available(),
      this.librosa(),
    ]);
    return {
      available: ffmpeg,
      ffmpeg,
      python: !!this.python && (await executable(this.python)),
      librosa,
    };
  }

  /** Checked once per server: set up the venv, then restart the server. */
  private librosa() {
    this.librosaFound ??= executable(this.python).then((found) =>
      found
        ? this.checkWorker({ python: this.python!, script: this.script })
        : false,
    );
    return this.librosaFound;
  }

  /** `sourceSession` holds a named source (an agent's picked one). */
  async analyze(body: unknown, sessionId: string, sourceSession = sessionId) {
    const input = request(body);
    const target = await this.target(input, sessionId, sourceSession);
    // One analysis at a time: it is CPU work on the person's machine. The
    // queue is bounded, so a burst cannot pile up decodes and threads.
    if (this.pending >= MAX_PENDING) throw busy();
    this.pending++;
    const next = this.queue.then(
      () => this.run(target, input.librosa),
      () => this.run(target, input.librosa),
    );
    this.queue = next.catch(() => {});
    void this.queue.then(() => this.pending--);
    return next;
  }

  private async target(
    input: ReturnType<typeof request>,
    sessionId: string,
    sourceSession: string,
  ): Promise<Target> {
    if (input.sourceId) {
      const { source, file, sha256 } = await this.resolve(
        input.sourceId,
        sourceSession,
      ).catch((error: unknown) => {
        // The lookup's own message speaks of video.
        if (error instanceof AppError && error.status === 404)
          throw new AppError(404, "Audio source not found.", "not_found");
        throw error;
      });
      if (source.mediaType !== "audio" || !sha256) throw notAudio();
      if (source.duration > MAX_AUDIO_SECONDS) throw tooLong();
      return { file, sha256, duration: source.duration };
    }
    const { project } = this.projects.read(input.copyId!, sessionId);
    const asset = Object.hasOwn(project.assets, input.assetId!)
      ? project.assets[input.assetId!]
      : undefined;
    if (!asset) throw new AppError(404, "Asset not found.", "asset_missing");
    if (asset.kind !== "audio") throw notAudio();
    const file = this.projects.filePath(
      input.copyId!,
      sessionId,
      asset.file.sha256,
    );
    // A project file is stored by its hash, not measured on the way in, so
    // its header is read here with the same bounded reader uploads use.
    const handle = await open(file, "r").catch(() => {
      throw new AppError(404, "File not found.", "file_missing");
    });
    try {
      const { size } = await handle.stat();
      if (size > MAX_AUDIO_BYTES)
        throw new AppError(413, "The audio is too large.", "audio_too_large");
      const { duration } = await inspectAudio(size, async (at, length) => {
        const bytes = new Uint8Array(length);
        const { bytesRead } = await handle.read(bytes, 0, length, at);
        return bytes.buffer.slice(0, bytesRead);
      }).catch((error: unknown) => {
        if (error instanceof AppError) throw error;
        throw notAudio();
      });
      if (duration > MAX_AUDIO_SECONDS) throw tooLong();
      return { file, sha256: asset.file.sha256, duration };
    } finally {
      await handle.close();
    }
  }

  private async run(target: Target, withLibrosa: boolean) {
    const coreKey = `${target.sha256}:core`,
      extraKey = `${target.sha256}:librosa`;
    let core = this.cached<AudioAnalysisReport>(coreKey);
    let extra = withLibrosa ? this.cached<LibrosaPart>(extraKey) : undefined;
    const librosa = withLibrosa && !extra && (await this.librosa());
    let samples: Float32Array | undefined;
    if (!core || librosa)
      samples = await this.tools.decodePcm(
        target.file,
        Math.min(target.duration + 1, MAX_AUDIO_SECONDS + 1),
        ANALYSIS_SAMPLE_RATE,
      );
    if (!core) {
      try {
        // The samples go to the thread and come back with the report.
        ({ report: core, samples } = await this.thread.run(
          samples!,
          ANALYSIS_SAMPLE_RATE,
        ));
      } catch (error) {
        // Refused input is never cached: the next request decodes again.
        if (error instanceof AudioInputError)
          throw new AppError(422, error.message, error.code);
        throw error;
      }
      this.remember(coreKey, core);
    }
    if (!withLibrosa) extra = { status: "not-requested" };
    else if (!extra && !librosa) extra = { status: "unavailable" };
    else if (!extra) {
      extra = await this.worker(samples!, core.durationSeconds);
      if (extra.status === "used") this.remember(extraKey, extra);
    }
    return { ...core, librosa: extra! } satisfies AudioAnalysisReport;
  }

  private async worker(samples: Float32Array, duration: number) {
    try {
      const message = await this.runWorker(
        { python: this.python!, script: this.script },
        samples,
        ANALYSIS_SAMPLE_RATE,
        120_000 + duration * 1000,
      );
      return librosaPart(message, duration);
    } catch (error) {
      return {
        status: "failed" as const,
        code: error instanceof WorkerError ? error.code : "worker_failed",
      };
    }
  }

  private cached<T>(key: string) {
    const value = this.cache.get(key);
    if (value) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value as T | undefined;
  }

  private remember(key: string, value: AudioAnalysisReport | LibrosaPart) {
    this.cache.set(key, value);
    if (this.cache.size > CACHE_ENTRIES)
      this.cache.delete(this.cache.keys().next().value!);
  }
}

/** `{ sourceId }` or `{ copyId, assetId }`, and optionally `librosa`. */
function request(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid();
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !KEYS.has(key))) throw invalid();
  const { sourceId, copyId, assetId, librosa } = input;
  if (librosa !== undefined && typeof librosa !== "boolean") throw invalid();
  const bySource = typeof sourceId === "string" && SOURCE_ID.test(sourceId);
  const byAsset =
    typeof copyId === "string" &&
    (COPY_ID.test(copyId) || DIRECTOR_ID.test(copyId)) &&
    typeof assetId === "string" &&
    DIRECTOR_ID.test(assetId);
  const named = [sourceId, copyId, assetId].filter((v) => v !== undefined);
  if (!(bySource && named.length === 1) && !(byAsset && named.length === 2))
    throw invalid();
  return {
    sourceId: bySource ? sourceId : undefined,
    copyId: byAsset ? copyId : undefined,
    assetId: byAsset ? assetId : undefined,
    librosa: librosa === true,
  };
}

const executable = (file?: string) =>
  !!file && path.isAbsolute(file)
    ? access(file, constants.X_OK).then(
        () => true,
        () => false,
      )
    : Promise.resolve(false);

const invalid = () =>
  new AppError(
    400,
    "Name an audio source with sourceId, or a project's copyId and assetId.",
    "invalid_request",
  );
const notAudio = () =>
  new AppError(
    415,
    "Choose WAV, FLAC or MP3 audio from this session or a linked project.",
    "not_audio",
  );
const busy = () =>
  new AppError(
    503,
    "Audio analysis is busy with other tracks. Try again in a moment.",
    "audio_busy",
  );
const tooLong = () =>
  new AppError(
    413,
    `Analyse audio up to ${MAX_AUDIO_SECONDS / 60} minutes long.`,
    "audio_too_long",
  );
