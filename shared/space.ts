/**
 * Space: an AKUSPACE room put on audio that already exists, by convolution
 * on the local server (`server/media-tools.ts`, `server/ffmpeg.ts`). The CPU
 * counterpart of the AKUSPACE LoRA: the LoRA generates the room inside LTX;
 * this processes a finished clip's sound in timed segments. It reads the
 * room presets and levels from `akuspace-presets.json` (see `acoustic.ts`), so
 * the names an agent learns for one are the names it uses for the other.
 *
 * Portable: no Node or DOM API. The room is described as data
 * (`roomResponse`) that the server turns into an ffmpeg graph and a later
 * browser preview can turn into a Web Audio buffer.
 */
import data from "./akuspace-presets.json";
import {
  gridFrame,
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_BPM,
} from "./director/beat-grid";
import { BEAT_GRID_LIMITS } from "./director/beat-grid-command";
import { MIN_MEDIA_SECONDS } from "./media-limits";

/** The rooms the node's control schema lists, in its order. */
export const SPACE_PRESETS = data.control_schema
  .room_presets as readonly SpacePreset[];
export type SpacePreset =
  "small_room" | "empty_club" | "medium_room" | "cathedral";
export const SPACE_LEVELS = data.control_schema
  .reverb_levels as readonly SpaceLevel[];
export type SpaceLevel = "low" | "mid" | "high";
/** Segments one request treats. */
export const MAX_SPACE_SEGMENTS = 16;
/** The fade at each segment edge, so the room switches without a click. */
export const SPACE_FADE_SECONDS = 0.02;
/** The impulse response runs this many RT60s: to −72 dB, under 16-bit hiss. */
export const SPACE_TAIL_RT60S = 1.2;
export const SPACE_SAMPLE_RATE = 48_000;
/** ln(1000): the decay rate, per RT60, that falls 60 dB. */
const LN_1000 = Math.log(1000);

/**
 * The cut-off of each room's synthetic response. The presets give no filter;
 * these follow their descriptions (small room "bright", empty club
 * "filtered") and are this tool's choice, not the node pack's.
 */
const LOWPASS_HZ: Record<SpacePreset, number> = {
  small_room: 9000,
  empty_club: 5000,
  medium_room: 7000,
  cathedral: 6000,
};

export interface SpaceRoom {
  preset: SpacePreset;
  label: string;
  rt60Seconds: number;
  lowpassHz: number;
}

/**
 * Decay times are the presets' `estimated_rt60`, which for three rooms is the
 * number their trained caption states (0.67, 1.2 and 1.9 seconds). The
 * cathedral caption states none ("a long decaying tail"); its 4.8 seconds is
 * the node pack's own estimate, read from the same file.
 */
export const SPACE_ROOMS: Record<SpacePreset, SpaceRoom> = Object.fromEntries(
  SPACE_PRESETS.map((preset) => {
    const spec = data.presets[preset];
    return [
      preset,
      {
        preset,
        label: spec.label,
        rt60Seconds: spec.estimated_rt60,
        lowpassHz: LOWPASS_HZ[preset],
      },
    ];
  }),
) as Record<SpacePreset, SpaceRoom>;

/** A level's wet gain in dB: the presets' `relative_db` (−25, −12, 0). */
export const wetDb = (level: SpaceLevel): number =>
  data.levels[level].relative_db;

export interface SpaceSegment {
  start: number;
  end: number;
  preset: SpacePreset;
  level: SpaceLevel;
}
/** A composition's grid, as `genobi_audio_analysis` reports `composition`. */
export interface SpaceGrid {
  bpm?: number;
  beatOffsetSeconds?: number;
  beatsPerBar?: number;
}
export interface SpaceRequest {
  sourceId: string;
  segments: SpaceSegment[];
  snap?: "beat" | "bar";
  grid?: SpaceGrid;
}

/**
 * A synthetic room: decaying stereo noise, `amplitude × u × e^(−decay·t)`
 * for `durationSeconds`, each channel from its own seed, then a lowpass. The
 * amplitude gives the filtered response about unit energy per channel, so a
 * level's `relative_db` is the wet signal's power against the dry signal's.
 */
export interface RoomResponse {
  preset: SpacePreset;
  sampleRate: number;
  rt60Seconds: number;
  durationSeconds: number;
  decayPerSecond: number;
  amplitude: number;
  lowpassHz: number;
  seeds: [number, number];
}

export function roomResponse(preset: SpacePreset): RoomResponse {
  const { rt60Seconds, lowpassHz } = SPACE_ROOMS[preset];
  const decayPerSecond = LN_1000 / rt60Seconds;
  const rate = SPACE_SAMPLE_RATE;
  // Uniform noise has power 1/3; Σ e^(−2·decay·n/rate) ≈ rate / (2·decay).
  // A two-pole lowpass keeps about 1.11 × cut-off / Nyquist of white noise.
  const kept = Math.min(1, (1.1107 * lowpassHz) / (rate / 2));
  const amplitude = Math.sqrt((6 * decayPerSecond) / rate / kept);
  return {
    preset,
    sampleRate: rate,
    rt60Seconds,
    durationSeconds: round3(SPACE_TAIL_RT60S * rt60Seconds),
    decayPerSecond,
    amplitude,
    lowpassHz,
    seeds: [2_654_435_761, 2_246_822_519],
  };
}

/** A request the space tool cannot carry out, in words for the person. */
export class SpaceRefusal extends Error {}
const refuse = (message: string): never => {
  throw new SpaceRefusal(message);
};

const NOT_ROOMS: Record<string, string> = {
  dry: "dry is no room: leave that part of the clip out of the segments.",
  outdoor_day:
    "outdoor_day is open-air ambience, not a room: the space tool adds no birdsong or other ambience. Use the AKUSPACE LoRA for it.",
  outdoor_night:
    "outdoor_night is open-air ambience, not a room: the space tool adds no crickets or other ambience. Use the AKUSPACE LoRA for it.",
  dual_delay:
    "dual_delay is a delay effect, not a room: the space tool has no delay. Use the AKUSPACE LoRA for it.",
};

function seconds(value: unknown, name: string, min: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min)
    refuse(`Give ${name} in seconds, at least ${min}.`);
  return value as number;
}

function readPreset(value: unknown): SpacePreset {
  if (typeof value === "string" && (SPACE_PRESETS as string[]).includes(value))
    return value as SpacePreset;
  if (typeof value === "string" && Object.hasOwn(NOT_ROOMS, value))
    refuse(NOT_ROOMS[value]);
  return refuse(`Choose a room: ${SPACE_PRESETS.join(", ")}.`);
}

function readLevel(value: unknown): SpaceLevel {
  if (value === undefined) return "mid";
  if (typeof value === "string" && (SPACE_LEVELS as string[]).includes(value))
    return value as SpaceLevel;
  return refuse(`Choose a level: ${SPACE_LEVELS.join(", ")}.`);
}

function readGrid(value: unknown): SpaceGrid {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    refuse("Give grid as bpm, beatOffsetSeconds and beatsPerBar.");
  const grid = value as Record<string, unknown>;
  const out: SpaceGrid = {};
  for (const key of ["bpm", "beatOffsetSeconds", "beatsPerBar"] as const) {
    const v = grid[key];
    if (v === undefined) continue;
    const { min, max, whole } = BEAT_GRID_LIMITS[key];
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      (whole && !Number.isInteger(v)) ||
      v < min ||
      v > max
    )
      refuse(
        `grid.${key} must be ${whole ? "a whole number" : "a number"} from ${min} to ${max}.`,
      );
    out[key] = v as number;
  }
  return out;
}

/** Ascending, apart, inside the clip, each at least the shortest cut. */
function checkSegments(
  segments: SpaceSegment[],
  duration: number,
  snapped = "",
) {
  let previous = 0;
  segments.forEach((segment, i) => {
    const n = i + 1;
    if (segment.end - segment.start < MIN_MEDIA_SECONDS - 1e-9)
      refuse(
        `Segment ${n} must run at least ${MIN_MEDIA_SECONDS} seconds${snapped}.`,
      );
    if (segment.end > duration + 0.001)
      refuse(`Segment ${n} must end inside the clip's own length.`);
    if (i > 0 && segment.start < previous - 1e-9)
      refuse(
        `Segment ${n} must start at or after segment ${i} ends${snapped}: segments run in order and do not overlap.`,
      );
    previous = segment.end;
  });
  return segments;
}

/**
 * A request as the server reads it: one to 16 segments, each `start` and
 * `end` in seconds with a room preset and a level (`mid` when left out),
 * checked against the clip's measured `duration`. Snapping, when asked, is
 * applied and checked again, since two edges can land on the same line.
 */
export function validateSpace(
  request: unknown,
  duration: number,
): SpaceRequest {
  if (!request || typeof request !== "object" || Array.isArray(request))
    refuse("Expected a media request.");
  const input = request as Record<string, unknown>;
  const list = input.segments;
  if (
    !Array.isArray(list) ||
    list.length < 1 ||
    list.length > MAX_SPACE_SEGMENTS
  )
    refuse(`Give one to ${MAX_SPACE_SEGMENTS} segments.`);
  const segments = (list as unknown[]).map((item): SpaceSegment => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      refuse("Give each segment as start, end, preset and level.");
    const s = item as Record<string, unknown>;
    return {
      start: seconds(s.start, "start", 0),
      end: seconds(s.end, "end", MIN_MEDIA_SECONDS),
      preset: readPreset(s.preset),
      level: readLevel(s.level),
    };
  });
  checkSegments(segments, duration);
  const snap = input.snap as "beat" | "bar" | undefined;
  if (snap !== undefined && snap !== "beat" && snap !== "bar")
    refuse('Snap to "beat" or "bar", or leave snap out.');
  if (input.grid !== undefined && snap === undefined)
    refuse("A grid is only used with snap.");
  const grid = readGrid(input.grid);
  const out: SpaceRequest = {
    sourceId: String(input.sourceId),
    segments,
  };
  if (snap === undefined) return out;
  return {
    ...out,
    snap,
    grid,
    segments: checkSegments(
      snapSegments(segments, grid, snap, duration),
      duration,
      ` once snapped to the ${snap}`,
    ),
  };
}

/**
 * Each edge moved to the nearest beat or bar line of the composition grid
 * (`beat-grid.ts`: lines at `beatOffsetSeconds + k × 60 / bpm`, a bar every
 * `beatsPerBar` beats from that downbeat), in milliseconds, then held inside
 * the clip when `duration` is given. Missing fields take the timeline's
 * defaults (120 BPM, 4 beats a bar, a downbeat at 0).
 */
export function snapSegments(
  segments: SpaceSegment[],
  grid: SpaceGrid,
  unit: "beat" | "bar",
  duration = Infinity,
): SpaceSegment[] {
  const beat = 60_000 / (grid.bpm ?? DEFAULT_BPM);
  const step =
    unit === "bar" ? beat * (grid.beatsPerBar ?? DEFAULT_BEATS_PER_BAR) : beat;
  const lines = { step, origin: (grid.beatOffsetSeconds ?? 0) * 1000 };
  const at = (time: number) =>
    Math.min(Math.max(gridFrame(time * 1000, lines) / 1000, 0), duration);
  return segments.map((segment) => ({
    ...segment,
    start: at(segment.start),
    end: at(segment.end),
  }));
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
