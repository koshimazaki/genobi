import { execFile } from "node:child_process";
import { MAX_RESULT_BYTES } from "../shared/lifecycle";
import {
  roomResponse,
  SPACE_FADE_SECONDS,
  wetDb,
  type RoomResponse,
  type SpaceSegment,
} from "../shared/space";
import { AppError } from "./errors";

/**
 * ffmpeg on the local server, with fixed arguments only. Every argument list
 * is built here from validated numbers and paths the server chose itself: no
 * shell, no request text, no user-named filter or codec. Output formats are
 * named explicitly, so a stored suffix like `.audio` never decides one.
 *
 * ffmpeg is never the authority on a price or a duration: uploads and outputs
 * are measured by the shared readers both adapters use (see server/media.ts
 * on why ffprobe left that job). Probing here answers what the readers do not
 * say — whether a clip has sound, and its frame rate.
 */
export type Run = (
  command: string,
  args: string[],
  timeoutMs: number,
) => Promise<string>;

export const runProcess: Run = (command, args, timeout) =>
  new Promise((resolve, reject) =>
    execFile(
      command,
      args,
      { timeout, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    ),
  );

export const FFMPEG_TIMEOUT_MS = 5 * 60_000;

export interface Probe {
  duration: number;
  video?: {
    width: number;
    height: number;
    fps: number;
    codec: string;
    /** The stream's frame count, when the container states it. */
    frames?: number;
    /** The frame rate as a fraction, "24/1", when it is one. */
    rate?: string;
  };
  audio?: { sampleRate: number; channels: number; codec: string };
}

/** Seconds as ffmpeg reads them, to the millisecond. */
export const t = (seconds: number) => seconds.toFixed(3);
export const QUIET = ["-hide_banner", "-nostdin", "-v", "error", "-y"];
export const MP4 = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  "-f",
  "mp4",
];
const WAV = ["-c:a", "pcm_s16le", "-f", "wav"];
const AAC = ["-c:a", "aac", "-b:a", "192k"];
export const AUDIO_FORMAT = "aformat=sample_rates=48000:channel_layouts=stereo";
/**
 * ffmpeg stops writing once a file passes `-fs`, and still exits cleanly, so a
 * result over the ceiling is caught as it grows rather than after it has
 * filled the disk. One byte over the ceiling means the limit was hit.
 */
export const output = (out: string) => [
  "-fs",
  String(MAX_RESULT_BYTES + 1),
  out,
];

export const ffmpegArgs = {
  /**
   * A room on a clip's sound in timed segments (`shared/space.ts`). Video
   * keeps its picture stream as it is (`-c:v copy`) and gains the treated
   * sound as AAC; audio comes back as 48 kHz stereo WAV.
   */
  space: (
    kind: "video" | "audio",
    file: string,
    probe: Probe,
    segments: SpaceSegment[],
    out: string,
    style: AfirStyle = "irnorm",
  ) => [
    ...QUIET,
    "-i",
    file,
    "-filter_complex",
    spaceGraph(segments, probe.duration, style),
    ...(kind === "video"
      ? [
          "-map",
          "0:v:0",
          "-map",
          "[a]",
          "-c:v",
          "copy",
          ...AAC,
          "-movflags",
          "+faststart",
          "-f",
          "mp4",
        ]
      : ["-map", "[a]", ...WAV]),
    ...output(out),
  ],
  probe: (file: string) => [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels",
    "-of",
    "json",
    file,
  ],
  /** A video cut is fitted to its own even size, which yuv420p needs. */
  trim: (
    kind: "video" | "audio",
    file: string,
    probe: Probe,
    start: number,
    duration: number,
    out: string,
  ) => [
    ...QUIET,
    "-ss",
    t(start),
    "-i",
    file,
    "-t",
    t(duration),
    ...(kind === "video"
      ? [
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-vf",
          `${evenFrame(probe)},format=yuv420p`,
          ...MP4,
        ]
      : ["-vn", ...WAV]),
    ...output(out),
  ],
  /**
   * Mono float32 PCM for analysis: at most `seconds` of it at `rate`, and
   * ffmpeg stops writing one sample past that many bytes.
   */
  pcm: (file: string, seconds: number, rate: number, out: string) => [
    ...QUIET,
    "-i",
    file,
    "-vn",
    "-t",
    t(seconds),
    "-ac",
    "1",
    "-ar",
    String(rate),
    "-c:a",
    "pcm_f32le",
    "-f",
    "f32le",
    "-fs",
    String(Math.ceil(seconds * rate) * 4 + 4),
    out,
  ],
  frame: (file: string, time: number, out: string) => [
    ...QUIET,
    "-ss",
    t(time),
    "-i",
    file,
    "-frames:v",
    "1",
    "-c:v",
    "png",
    "-f",
    "image2",
    ...output(out),
  ],
  /**
   * Joins clips end to end. Video is fitted to the first clip's even size and
   * frame rate; sound is kept only when every clip has it.
   */
  concat: (
    kind: "video" | "audio",
    files: string[],
    probes: Probe[],
    out: string,
  ) => {
    const inputs = files.flatMap((file) => ["-i", file]);
    if (kind === "audio") {
      const graph =
        files.map((_, i) => `[${i}:a:0]${AUDIO_FORMAT}[a${i}]`).join(";") +
        `;${files.map((_, i) => `[a${i}]`).join("")}concat=n=${files.length}:v=0:a=1[a]`;
      return [
        ...QUIET,
        ...inputs,
        "-filter_complex",
        graph,
        "-map",
        "[a]",
        ...WAV,
        ...output(out),
      ];
    }
    const sound = probes.every((probe) => probe.audio);
    const graph = [
      ...files.map((_, i) => `[${i}:v:0]${fit(probes[0])}[v${i}]`),
      ...(sound ? files.map((_, i) => `[${i}:a:0]${AUDIO_FORMAT}[a${i}]`) : []),
      files.map((_, i) => `[v${i}]${sound ? `[a${i}]` : ""}`).join("") +
        `concat=n=${files.length}:v=1:a=${sound ? 1 : 0}[v]${sound ? "[a]" : ""}`,
    ].join(";");
    return [
      ...QUIET,
      ...inputs,
      "-filter_complex",
      graph,
      "-map",
      "[v]",
      ...(sound ? ["-map", "[a]"] : []),
      ...MP4,
      ...output(out),
    ];
  },
  /**
   * Two clips overlapping by `overlap` seconds: a fade for picture, an
   * equal-power fade for sound. A clip's picture and sound can end at
   * different times, while `lengths` (from the shared reader) can be the
   * longer of the two; each video clip's streams are held or padded to that
   * length first, so the picture fade starts where the sound fade does.
   */
  crossfade: (
    kind: "video" | "audio",
    files: [string, string],
    probes: [Probe, Probe],
    lengths: [number, number],
    overlap: number,
    out: string,
  ) => {
    const inputs = files.flatMap((file) => ["-i", file]);
    const sound = kind === "audio" || probes.every((probe) => probe.audio);
    // Audio files have one stream, so only video clips need their sound held.
    const hold = (i: number) =>
      kind === "video"
        ? `,apad=whole_dur=${t(lengths[i])},atrim=duration=${t(lengths[i])},asetpts=PTS-STARTPTS`
        : "";
    const audio = sound
      ? [
          `[0:a:0]${AUDIO_FORMAT}${hold(0)}[a0]`,
          `[1:a:0]${AUDIO_FORMAT}${hold(1)}[a1]`,
          `[a0][a1]acrossfade=d=${t(overlap)}[a]`,
        ]
      : [];
    if (kind === "audio")
      return [
        ...QUIET,
        ...inputs,
        "-filter_complex",
        audio.join(";"),
        "-map",
        "[a]",
        ...WAV,
        ...output(out),
      ];
    // tpad holds the last picture past its end; trim then cuts to the length,
    // and fps restores the constant rate xfade requires.
    const segment = (i: number) =>
      `[${i}:v:0]${evenFrame(probes[0])},` +
      `tpad=stop_mode=clone:stop_duration=${t(lengths[i])},` +
      `trim=duration=${t(lengths[i])},setpts=PTS-STARTPTS,` +
      `${rate(probes[0])},format=yuv420p[v${i}]`;
    const graph = [
      segment(0),
      segment(1),
      `[v0][v1]xfade=transition=fade:duration=${t(overlap)}:offset=${t(lengths[0] - overlap)}[v]`,
      ...audio,
    ].join(";");
    return [
      ...QUIET,
      ...inputs,
      "-filter_complex",
      graph,
      "-map",
      "[v]",
      ...(sound ? ["-map", "[a]"] : []),
      ...MP4,
      ...output(out),
    ];
  },
};

/**
 * How `afir` is told to leave the impulse response as given. ffmpeg 6 names
 * the auto gain `gtype` (`none` turns it off); ffmpeg 7 replaced it with
 * `irnorm`, where a negative value turns normalising off.
 */
export type AfirStyle = "gtype" | "irnorm";
const AFIR: Record<AfirStyle, string> = {
  gtype: "afir=gtype=none:irgain=1:dry=1:wet=1",
  irnorm: "afir=irnorm=-1:irgain=1:dry=1:wet=1",
};

/**
 * The style for `ffmpeg -version` output: ffmpeg 6 and older use `gtype`; 7,
 * later releases and builds whose version is not a release number (git
 * snapshots, which are newer) use `irnorm`.
 */
export function afirStyle(version: string): AfirStyle {
  const major = Number(/ffmpeg version n?(\d+)\./.exec(version)?.[1]);
  return Number.isFinite(major) && major > 0 && major < 7 ? "gtype" : "irnorm";
}

/** Decaying noise, one seeded expression per channel, then the lowpass. */
function room(response: RoomResponse) {
  const channel = (seed: number) =>
    `ifnot(n,st(0,${seed}));` +
    `${response.amplitude.toFixed(6)}*(random(0)*2-1)*exp(-${response.decayPerSecond.toFixed(6)}*t)`;
  return (
    `aevalsrc='${response.seeds.map(channel).join("|")}'` +
    `:s=${response.sampleRate}:d=${t(response.durationSeconds)},` +
    `lowpass=f=${response.lowpassHz}`
  );
}

/**
 * Each segment's dry sound, faded in and out at its edges, padded by its
 * room's tail, convolved with that room, set to its level and delayed back
 * to its start; the wet segments are mixed onto the whole dry signal, which
 * sets the length, so a tail that would ring past the clip's end is cut there.
 */
function spaceGraph(
  segments: SpaceSegment[],
  length: number,
  style: AfirStyle,
) {
  const n = segments.length;
  const taps = segments.map((_, i) => `[s${i}]`).join("");
  const chains = segments.flatMap((segment, i) => {
    const response = roomResponse(segment.preset);
    const span = segment.end - segment.start;
    const tail = Math.max(
      0,
      Math.min(response.durationSeconds, length - segment.end),
    );
    return [
      `${room(response)}[ir${i}]`,
      `[s${i}]atrim=start=${t(segment.start)}:end=${t(segment.end)},` +
        `asetpts=PTS-STARTPTS,afade=t=in:d=${t(SPACE_FADE_SECONDS)},` +
        `afade=t=out:st=${t(span - SPACE_FADE_SECONDS)}:d=${t(SPACE_FADE_SECONDS)}` +
        // apad with no length would pad for ever; a segment ending at the
        // clip's end has no tail to make room for.
        `${tail > 0.0005 ? `,apad=pad_dur=${t(tail)}` : ""}[x${i}]`,
      `[x${i}][ir${i}]${AFIR[style]},volume=${wetDb(segment.level)}dB,` +
        `adelay=delays=${Math.round(segment.start * response.sampleRate)}S:all=1[w${i}]`,
    ];
  });
  return [
    `[0:a:0]${AUDIO_FORMAT},asplit=${n + 1}[dry]${taps}`,
    ...chains,
    `[dry]${segments.map((_, i) => `[w${i}]`).join("")}` +
      `amix=inputs=${n + 1}:duration=first:dropout_transition=0:normalize=0[a]`,
  ].join(";");
}

/** Scale into the target's frame rounded down to even sides, letterboxed. */
function evenFrame(target: Probe) {
  const width = even(target.video!.width),
    height = even(target.video!.height);
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`
  );
}
const rate = (target: Probe) =>
  `fps=${Math.min(Math.max(Math.round(target.video!.fps), 1), 60)}`;
/** Scale into the first clip's frame, letterboxed, at its frame rate. */
const fit = (target: Probe) =>
  `${evenFrame(target)},${rate(target)},format=yuv420p`;
export const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** Reads only the fields asked for, each bounded; anything else is ignored. */
export function parseProbe(stdout: string): Probe {
  let data: {
    format?: { duration?: string };
    streams?: {
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      nb_frames?: string;
      sample_rate?: string;
      channels?: number;
    }[];
  };
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new AppError(400, "ffmpeg could not read this file.");
  }
  const duration = Number(data.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new AppError(400, "ffmpeg could not read this file's duration.");
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const [num, den] = String(video?.r_frame_rate ?? "0/1")
    .split("/")
    .map(Number);
  return {
    duration,
    ...(video && Number(video.width) > 0 && Number(video.height) > 0
      ? {
          video: {
            width: Number(video.width),
            height: Number(video.height),
            fps: den ? num / den : 0,
            codec: String(video.codec_name ?? "").slice(0, 32),
            ...(Number.isSafeInteger(num) &&
            Number.isSafeInteger(den) &&
            num > 0 &&
            den > 0
              ? { rate: `${num}/${den}` }
              : {}),
            ...(Number.isSafeInteger(Number(video.nb_frames)) &&
            Number(video.nb_frames) > 0
              ? { frames: Number(video.nb_frames) }
              : {}),
          },
        }
      : {}),
    ...(audio
      ? {
          audio: {
            sampleRate: Number(audio.sample_rate) || 0,
            channels: Number(audio.channels) || 0,
            codec: String(audio.codec_name ?? "").slice(0, 32),
          },
        }
      : {}),
  };
}
