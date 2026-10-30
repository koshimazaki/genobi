import { z } from "zod";
import { MAX_AUDIO_SECONDS } from "../shared/audio";
import {
  MAX_MEDIA_FRAMES,
  MAX_MEDIA_INPUTS,
  MAX_MEDIA_OVERLAP,
  MEDIA_SOURCE_ID,
  MIN_MEDIA_SECONDS,
} from "../shared/media-limits";
import { BEAT_GRID_LIMITS } from "../shared/director/beat-grid-command";
import {
  MAX_SPACE_SEGMENTS,
  SPACE_LEVELS,
  SPACE_PRESETS,
  SPACE_ROOMS,
} from "../shared/space";
import type { Source } from "../shared/types";
import type { ToolDefinition } from "./definition";

// Dual Swords' media tools for agents: thin clients of the local server's
// ffmpeg routes (server/media-routes.ts, server/media-tools.ts). Local CPU
// work, never paid; the hosted Worker has no such routes. Every result is a
// new `derived` source in this agent's own studio session.

const sourceId = z
  .string()
  .regex(MEDIA_SOURCE_ID)
  .describe(
    "A video or audio source in this session: a take's job id, an audio upload, an earlier media result or a library clip",
  );
/** No stored source is longer than an audio upload, so no time is later. */
const time = z.number().min(0).max(MAX_AUDIO_SECONDS);
const TAGS = ["agents", "mcp", "dual-editor"];
/** Where a result goes next: the person's project (server/project-derived.ts). */
const HAND_IN =
  " genobi_take_to_project with its sourceId places the result in a linked Director project.";
const DOCS = ["docs/dual-editor.md", "docs/architecture.md"];
const WRITE = {
  readOnlyHint: false,
  // Each call makes another file, so a repeat is not free of effect.
  idempotentHint: false,
  destructiveHint: false,
} as const;

/** A made file as an agent needs it: its id to pass on, and what it measures. */
function made(source: Source) {
  return {
    sourceId: source.id,
    label: source.label,
    kind: source.mediaType ?? "video",
    width: source.width,
    height: source.height,
    duration: source.duration,
  };
}

async function produce(
  api: Parameters<ToolDefinition["run"]>[0],
  operation: "trim" | "concat" | "crossfade" | "space",
  body: Record<string, unknown>,
) {
  const { source } = await api.post<{ source: Source }>(
    `/api/media/${operation}`,
    body,
  );
  return made(source);
}

export const mediaTools: ToolDefinition[] = [
  {
    name: "genobi_media_tools",
    title: "Genobi media tools check",
    description:
      "Whether ffmpeg is installed for the studio's local media tools (genobi_media_probe, _frames, _trim, _concat, _crossfade, _space). If ffmpeg is false, ask the person to install ffmpeg and restart the studio; the hosted studio has none. Reads only; never paid.",
    inputSchema: {},
    tags: TAGS,
    docs: DOCS,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api) {
      return api.get<{ ffmpeg: boolean }>("/api/media/tools");
    },
  },
  {
    name: "genobi_media_probe",
    title: "Genobi media probe",
    description:
      "Measure a video or audio source with ffprobe: duration in seconds, the video stream (width, height, fps, codec) and the audio stream (sampleRate, channels, codec), each present only when the file has it. A take the person picked can be probed too. Reads only; never paid.",
    inputSchema: { sourceId },
    tags: TAGS,
    docs: DOCS,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      return (
        await api.get<{ probe: unknown }>(
          `/api/media/${encodeURIComponent(String(args.sourceId))}/probe`,
        )
      ).probe;
    },
  },
  {
    name: "genobi_media_frames",
    title: "Genobi media frames",
    description: `Extract still frames from a video at the given times (seconds from its start, each before its end; one to ${MAX_MEDIA_FRAMES}). Each frame is saved as a PNG image source in this session, in the order asked; returns their sourceIds and sizes. Local ffmpeg, never paid.`,
    inputSchema: {
      sourceId,
      times: z
        .array(time)
        .min(1)
        .max(MAX_MEDIA_FRAMES)
        .describe("Seconds from the start, each inside the clip"),
    },
    tags: TAGS,
    docs: DOCS,
    annotations: WRITE,
    async run(api, args) {
      const { sources } = await api.post<{ sources: Source[] }>(
        "/api/media/frames",
        { sourceId: args.sourceId, times: args.times },
      );
      return sources.map(made);
    },
  },
  {
    name: "genobi_media_trim",
    title: "Genobi media trim",
    description:
      "Cut a section out of a video or audio source: duration seconds from start, inside the clip. A video cut comes back as an H.264 MP4 with the source's picture (rounded down to even sides) and its sound if any, at most two minutes; an audio cut as 16-bit WAV, at most twenty. Saved as a new source in this session; the source is unchanged. Local ffmpeg, never paid." +
      HAND_IN,
    inputSchema: {
      sourceId,
      start: time.describe("Seconds from the start of the clip"),
      duration: time
        .min(MIN_MEDIA_SECONDS)
        .describe("Length of the cut, in seconds"),
    },
    tags: TAGS,
    docs: DOCS,
    annotations: WRITE,
    async run(api, args) {
      return produce(api, "trim", {
        sourceId: args.sourceId,
        start: args.start,
        duration: args.duration,
      });
    },
  },
  {
    name: "genobi_media_concat",
    title: "Genobi media concat",
    description: `Join two to ${MAX_MEDIA_INPUTS} clips end to end, in order: all video or all audio. Video is fitted to the first clip's even size and frame rate and keeps sound only when every clip has it; audio comes back as 48 kHz stereo WAV. The result is at most two minutes of video or twenty of audio. Saved as a new source in this session. Local ffmpeg, never paid.${HAND_IN}`,
    inputSchema: {
      sourceIds: z
        .array(sourceId)
        .min(2)
        .max(MAX_MEDIA_INPUTS)
        .describe("The clips, in playing order"),
    },
    tags: TAGS,
    docs: DOCS,
    annotations: WRITE,
    async run(api, args) {
      return produce(api, "concat", { sourceIds: args.sourceIds });
    },
  },
  {
    name: "genobi_media_crossfade",
    title: "Genobi media crossfade",
    description: `Crossfade two clips of the same kind: the second fades in over the end of the first for duration seconds (${MIN_MEDIA_SECONDS} to ${MAX_MEDIA_OVERLAP}, shorter than either clip). Video is fitted to the first clip as concat does and keeps sound only when both clips have it. Saved as a new source in this session. Local ffmpeg, never paid.${HAND_IN}`,
    inputSchema: {
      sourceIds: z
        .array(sourceId)
        .length(2)
        .describe("The outgoing clip, then the incoming one"),
      duration: z
        .number()
        .min(MIN_MEDIA_SECONDS)
        .max(MAX_MEDIA_OVERLAP)
        .describe("Overlap in seconds"),
    },
    tags: TAGS,
    docs: DOCS,
    annotations: WRITE,
    async run(api, args) {
      return produce(api, "crossfade", {
        sourceIds: args.sourceIds,
        duration: args.duration,
      });
    },
  },
  {
    name: "genobi_media_space",
    title: "Genobi media space",
    description: `Put an AKUSPACE room on a video or audio clip's existing sound, in one to ${MAX_SPACE_SEGMENTS} timed segments (start and end in seconds, in order, not overlapping, inside the clip). Rooms: ${SPACE_PRESETS.map((p) => `${p} (${SPACE_ROOMS[p].rt60Seconds} s decay)`).join(", ")}; level low, mid (default) or high is the wet level, -25, -12 or 0 dB. The outdoor day and night presets (ambience) and dual_delay (a delay) are not available here; they exist only in the AKUSPACE LoRA. Each segment's tail rings past its end, up to the clip's end. snap "beat" or "bar" moves the edges to the composition grid (grid: bpm, beatOffsetSeconds, beatsPerBar, as genobi_audio_analysis reports composition; 120 BPM in 4 when left out). Video keeps its picture stream copied as it is and gains the treated sound; audio comes back as 48 kHz stereo WAV. Saved as a new source in this session; the source is unchanged. Local ffmpeg convolution, never paid.${HAND_IN}`,
    inputSchema: {
      sourceId,
      segments: z
        .array(
          z.object({
            start: time.describe("Seconds from the start of the clip"),
            end: time
              .min(MIN_MEDIA_SECONDS)
              .describe("Seconds from the start; the room's tail rings on"),
            preset: z.enum(SPACE_PRESETS).describe("The room"),
            level: z
              .enum(SPACE_LEVELS)
              .optional()
              .describe("Wet level: low, mid (default) or high"),
          }),
        )
        .min(1)
        .max(MAX_SPACE_SEGMENTS)
        .describe("The rooms, in order, each over its own stretch of time"),
      snap: z
        .enum(["beat", "bar"])
        .optional()
        .describe("Move segment edges to the nearest beat or bar line"),
      grid: z
        .object({
          bpm: limited("bpm"),
          beatOffsetSeconds: limited("beatOffsetSeconds"),
          beatsPerBar: limited("beatsPerBar"),
        })
        .optional()
        .describe("The composition's grid, used only with snap"),
    },
    tags: [...TAGS, "sound"],
    docs: ["docs/media-space.md", ...DOCS],
    annotations: WRITE,
    async run(api, args) {
      return produce(api, "space", {
        sourceId: args.sourceId,
        segments: args.segments,
        ...(args.snap === undefined ? {} : { snap: args.snap }),
        ...(args.grid === undefined ? {} : { grid: args.grid }),
      });
    },
  },
];

/** A beat grid field held to the bounds the Director's set-beat-grid uses. */
function limited(field: keyof typeof BEAT_GRID_LIMITS) {
  const { min, max, whole } = BEAT_GRID_LIMITS[field];
  const number = z.number().min(min).max(max);
  return (whole ? number.int() : number).optional();
}
