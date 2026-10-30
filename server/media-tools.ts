import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, open, readFile, rm, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectAudio, MAX_AUDIO_SECONDS } from "../shared/audio";
import { inspectImage } from "../shared/image";
import { MAX_RESULT_BYTES } from "../shared/lifecycle";
import {
  MAX_MEDIA_FRAMES as MAX_FRAMES,
  MAX_MEDIA_INPUTS as MAX_INPUTS,
  MAX_MEDIA_OVERLAP as MAX_OVERLAP,
  MAX_VIDEO_SECONDS,
  MEDIA_SOURCE_ID,
  MIN_MEDIA_SECONDS,
} from "../shared/media-limits";
import { SpaceRefusal, validateSpace } from "../shared/space";
import type { Source } from "../shared/types";
import { UPLOAD_SUFFIX } from "../shared/uploads";
import { AppError } from "./errors";
import {
  afirStyle,
  FFMPEG_TIMEOUT_MS,
  ffmpegArgs,
  parseProbe,
  runProcess,
  type Probe,
  type Run,
} from "./ffmpeg";
import { probeVideo } from "./media";
import {
  publicSource,
  type MediaOperation,
  type Store,
  type StoredSource,
} from "./store";

export interface MediaToolsOptions {
  run?: Run;
  /** Defaults to `FFMPEG_PATH`/`FFPROBE_PATH`, then the binaries on PATH. */
  ffmpeg?: string;
  ffprobe?: string;
}
type Resolve = (
  id: string,
  sessionId: string,
) => Promise<{ source: Source; file: string }>;
type Kind = "video" | "audio";

export { MAX_VIDEO_SECONDS };

/**
 * Each operation's word in a derived source's label ("Trim of ..."), which
 * also names the operation of a source saved before it was recorded.
 */
export const OPERATION_VERB: Record<MediaOperation, string> = {
  trim: "Trim",
  frames: "Frame",
  concat: "Joined",
  crossfade: "Crossfade",
  space: "Space",
};

/**
 * The local server's media service: probe, trim, extract frames, concat and
 * crossfade over sources the session owns, one ffmpeg run at a time. Every
 * result is measured by the shared readers, hashed, and saved as a `derived`
 * source the session owns. The hosted Worker has no ffmpeg and no such routes.
 */
export class MediaTools {
  private queue: Promise<unknown> = Promise.resolve();
  private present?: Promise<boolean>;
  /** `ffmpeg -version`'s answer, which names the `afir` options to use. */
  private version = "";
  private readonly run: Run;
  private readonly ffmpeg: string;
  private readonly ffprobe: string;

  constructor(
    readonly store: Store,
    private readonly resolve: Resolve,
    options: MediaToolsOptions = {},
  ) {
    this.run = options.run ?? runProcess;
    this.ffmpeg = options.ffmpeg ?? process.env.FFMPEG_PATH ?? "ffmpeg";
    this.ffprobe = options.ffprobe ?? process.env.FFPROBE_PATH ?? "ffprobe";
  }

  /** Checked once per server: install ffmpeg, then restart the server. */
  available() {
    this.present ??= this.run(this.ffmpeg, ["-version"], 10_000).then(
      (stdout) => {
        this.version = String(stdout ?? "");
        return true;
      },
      () => false,
    );
    return this.present;
  }

  async probe(id: string, sessionId: string) {
    // Not found before not installed: the id is checked first.
    const { file } = await this.resolve(id, sessionId);
    await this.require();
    return this.probeFile(file);
  }

  async trim(body: unknown, sessionId: string) {
    const input = record(body);
    const [from] = await this.sources([input.sourceId], sessionId, 1);
    const kind = mediaKind(from.source);
    const start = seconds(input.start, "start", 0);
    const duration = seconds(input.duration, "duration", MIN_MEDIA_SECONDS);
    if (start + duration > from.source.duration + 0.001)
      throw new AppError(400, "Trim inside the clip's own length.");
    limitLength(kind, duration);
    const [probe] = await this.probes([from], kind);
    // A cut keeps the source's rate and channels as 16-bit WAV, so a short
    // compressed file can decode to gigabytes; refuse that before running.
    if (
      kind === "audio" &&
      probe.audio &&
      duration * probe.audio.sampleRate * probe.audio.channels * 2 >
        MAX_RESULT_BYTES
    )
      throw tooLarge();
    return this.produce(kind, [from], sessionId, "trim", (out) =>
      ffmpegArgs.trim(kind, from.file, probe, start, duration, out),
    );
  }

  async frames(body: unknown, sessionId: string) {
    const input = record(body);
    const [from] = await this.sources([input.sourceId], sessionId, 1);
    if (mediaKind(from.source) !== "video")
      throw new AppError(400, "Frames come from a video.");
    if (
      !Array.isArray(input.times) ||
      input.times.length < 1 ||
      input.times.length > MAX_FRAMES
    )
      throw new AppError(400, `Ask for one to ${MAX_FRAMES} frames.`);
    const times = input.times.map((time) => seconds(time, "time", 0));
    if (times.some((time) => time >= from.source.duration))
      throw new AppError(400, "Pick frames inside the clip's own length.");
    const sources: Source[] = [];
    for (const time of times)
      sources.push(
        await this.produce("image", [from], sessionId, "frames", (out) =>
          ffmpegArgs.frame(from.file, time, out),
        ),
      );
    return sources;
  }

  async concat(body: unknown, sessionId: string) {
    const input = record(body);
    const from = await this.sources(input.sourceIds, sessionId, MAX_INPUTS);
    if (from.length < 2) throw new AppError(400, "Join at least two clips.");
    const kind = sameKind(from);
    limitLength(
      kind,
      from.reduce((sum, item) => sum + item.source.duration, 0),
    );
    const probes = await this.probes(from, kind);
    return this.produce(kind, from, sessionId, "concat", (out) =>
      ffmpegArgs.concat(
        kind,
        from.map((item) => item.file),
        probes,
        out,
      ),
    );
  }

  async crossfade(body: unknown, sessionId: string) {
    const input = record(body);
    const from = await this.sources(input.sourceIds, sessionId, 2);
    if (from.length !== 2)
      throw new AppError(400, "Crossfade exactly two clips.");
    const kind = sameKind(from);
    const overlap = seconds(input.duration, "duration", MIN_MEDIA_SECONDS);
    const [a, b] = from;
    if (
      overlap > MAX_OVERLAP ||
      overlap >= a.source.duration ||
      overlap >= b.source.duration
    )
      throw new AppError(
        400,
        `Overlap up to ${MAX_OVERLAP} seconds, shorter than either clip.`,
      );
    limitLength(kind, a.source.duration + b.source.duration - overlap);
    const [pa, pb] = await this.probes(from, kind);
    return this.produce(kind, from, sessionId, "crossfade", (out) =>
      ffmpegArgs.crossfade(
        kind,
        [a.file, b.file],
        [pa, pb],
        [a.source.duration, b.source.duration],
        overlap,
        out,
      ),
    );
  }

  /**
   * An AKUSPACE room on a clip's sound in timed segments (`shared/space.ts`):
   * the source is untouched and the result is a new derived source, a video
   * with its picture copied as it is, or 48 kHz stereo WAV.
   */
  async space(body: unknown, sessionId: string) {
    const input = record(body);
    const [from] = await this.sources([input.sourceId], sessionId, 1);
    const kind = mediaKind(from.source);
    let request;
    try {
      request = validateSpace(input, from.source.duration);
    } catch (error) {
      if (error instanceof SpaceRefusal) throw new AppError(400, error.message);
      throw error;
    }
    limitLength(kind, from.source.duration);
    const [probe] = await this.probes([from], kind);
    if (!probe.audio)
      throw new AppError(400, "This clip has no sound to put a room on.");
    const style = afirStyle(this.version);
    return this.produce(kind, [from], sessionId, "space", (out) =>
      ffmpegArgs.space(kind, from.file, probe, request.segments, out, style),
    );
  }

  /**
   * A stored audio file as mono float32 samples at `rate`, for analysis. The
   * file is one the caller resolved for the session; the decoded copy lives
   * in a private temporary folder only while it is read.
   */
  async decodePcm(file: string, seconds: number, rate: number) {
    await this.require();
    const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-pcm-"));
    const out = path.join(folder, "audio.f32");
    try {
      await this.exclusive(() =>
        this.run(
          this.ffmpeg,
          ffmpegArgs.pcm(file, seconds, rate, out),
          FFMPEG_TIMEOUT_MS,
        ),
      );
      const bytes = await readFile(out);
      if (
        !bytes.length ||
        bytes.length % 4 ||
        bytes.length / 4 > seconds * rate + 1
      )
        throw failed();
      const samples = new Float32Array(bytes.length / 4);
      new Uint8Array(samples.buffer).set(bytes);
      return samples;
    } catch {
      // ffmpeg's own message names local paths; it stays on the server.
      throw failed();
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  /** Refuses with the install hint when ffmpeg is absent. */
  async require() {
    if (!(await this.available()))
      throw new AppError(
        503,
        "Install ffmpeg to use media tools on this machine, then restart the server.",
        "ffmpeg_missing",
      );
  }

  private async sources(ids: unknown, sessionId: string, max: number) {
    await this.require();
    const list = Array.isArray(ids) ? ids : [ids];
    if (
      list.length > max ||
      !list.every((id) => typeof id === "string" && MEDIA_SOURCE_ID.test(id))
    )
      throw new AppError(400, "Choose clips from this session or the library.");
    return Promise.all(list.map((id) => this.resolve(id, sessionId)));
  }

  async probeFile(file: string): Promise<Probe> {
    let stdout;
    try {
      stdout = await this.exclusive(() =>
        this.run(this.ffprobe, ffmpegArgs.probe(file), 30_000),
      );
    } catch {
      // As with ffmpeg below: the tool's own message stays on the server.
      throw failed();
    }
    return parseProbe(stdout);
  }

  private async probes(from: { file: string }[], kind: Kind) {
    const probes: Probe[] = [];
    for (const item of from) probes.push(await this.probeFile(item.file));
    if (kind === "video" && probes.some((probe) => !probe.video))
      throw new AppError(400, "ffmpeg found no picture in one of the clips.");
    return probes;
  }

  /** One ffmpeg at a time, so a busy agent cannot saturate the machine. */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => {});
    return next;
  }

  /** One ffmpeg run saved as a derived source; `label` names it otherwise. */
  async produce(
    kind: "video" | "image" | "audio",
    from: { source: Source }[],
    sessionId: string,
    operation: MediaOperation,
    build: (out: string) => string[],
    label = `${OPERATION_VERB[operation]} of ${from[0].source.label}`,
  ): Promise<Source> {
    const id = randomUUID();
    const file = path.join(
      this.store.directory,
      "media",
      `${id}.${UPLOAD_SUFFIX[kind]}`,
    );
    try {
      // Every argument list ends in `-fs`, so ffmpeg stops a result just past
      // the ceiling; anything over it was cut short and is refused here.
      await this.exclusive(() =>
        this.run(this.ffmpeg, build(file), FFMPEG_TIMEOUT_MS),
      );
      const { size } = await stat(file);
      if (!size || size > MAX_RESULT_BYTES) throw tooLarge();
      const source: StoredSource = {
        id,
        sessionId,
        filePath: file,
        sha256: await hashFile(file),
        derivedFrom: from.map((item) => item.source.id),
        operation,
        url: `/api/clips/${id}`,
        label: label.slice(0, 100),
        origin: "derived",
        ...(kind === "video" ? {} : { mediaType: kind }),
        ...(await measure(kind, file, size)),
      };
      this.store.data.sources.push(source);
      await this.store.save();
      return publicSource(source);
    } catch (error) {
      await unlink(file).catch(() => {});
      if (error instanceof AppError) throw error;
      // ffmpeg's own message names local paths; it stays on the server.
      throw failed();
    }
  }
}

function record(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AppError(400, "Expected a media request.");
  return body as Record<string, unknown>;
}

function seconds(value: unknown, name: string, min: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min)
    throw new AppError(400, `Give ${name} in seconds, at least ${min}.`);
  return value;
}

function mediaKind(source: Source): Kind {
  if (source.mediaType === "image")
    throw new AppError(400, "Images have no length to cut or join.");
  return source.mediaType === "audio" ? "audio" : "video";
}

function sameKind(from: { source: Source }[]): Kind {
  const kinds = new Set(from.map((item) => mediaKind(item.source)));
  if (kinds.size !== 1)
    throw new AppError(400, "Join video with video and audio with audio.");
  return [...kinds][0];
}

const failed = () =>
  new AppError(422, "ffmpeg could not make this file.", "ffmpeg_failed");
const tooLarge = () =>
  new AppError(400, "The result is larger than the studio keeps.");

function limitLength(kind: Kind, total: number) {
  const max = kind === "video" ? MAX_VIDEO_SECONDS : MAX_AUDIO_SECONDS;
  if (total > max)
    throw new AppError(400, `Keep the result under ${max / 60} minutes.`);
}

/** The shared readers, never ffprobe, decide what a stored file measures. */
async function measure(
  kind: "video" | "image" | "audio",
  file: string,
  size: number,
) {
  if (kind === "video") return probeVideo(file);
  if (kind === "image")
    return inspectImage(new Uint8Array(await readFile(file)));
  const handle = await open(file, "r");
  try {
    return await inspectAudio(size, async (offset, length) => {
      const bytes = new Uint8Array(length);
      const { bytesRead } = await handle.read(bytes, 0, length, offset);
      return bytes.buffer.slice(0, bytesRead);
    });
  } finally {
    await handle.close();
  }
}

function hashFile(file: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}
