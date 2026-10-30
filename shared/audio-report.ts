import { median } from "./audio-tempo";
import { DEFAULT_BEATS_PER_BAR } from "./director/beat-grid";
import type { Project } from "./director/types";

/**
 * The one audio analysis report, written by the local server's own analysis
 * (audio-analysis.ts) and, when asked, extended with the optional librosa
 * worker's view in the same shapes. Times are seconds from the start of the
 * audio, rounded to the millisecond.
 */
export const AUDIO_ANALYSIS_VERSION = 1;
/** The rate ffmpeg decodes to for analysis: mono, 22.05 kHz, float32. */
export const ANALYSIS_SAMPLE_RATE = 22_050;
/** Onsets kept per band; a 20-minute track at 4 per second fits. */
export const MAX_ONSETS = 5000;

/** A straight beat grid fitted by least squares over detected beats. */
export interface BeatGridReport {
  /** Full fitted precision, as are `periodSeconds` and `composition.bpm`. */
  bpm: number;
  periodSeconds: number;
  /** The first grid beat at or after 0 s. */
  firstBeatSeconds: number;
  /** Assumed, not detected: the person sets the metre. */
  beatsPerBar: number;
  /** Detected beats the line was fitted over, and how many it kept. */
  detectedBeats: number;
  fittedBeats: number;
  /** Median distance of the kept beats from the line. */
  residualMs: number;
  /** Kept share × closeness of fit × share of beats on an onset, 0 to 1. */
  confidence: number;
}

/**
 * Which beat of the bar is the downbeat, from low-band (<150 Hz) energy per
 * beat: a weak signal, so always an estimate the person confirms.
 */
export interface DownbeatEstimate {
  estimate: true;
  firstDownbeatSeconds: number;
  /** The loudest beat-in-bar's low energy over the next loudest. */
  contrast: number;
  confidence: number;
  method: "low-band energy per beat";
}

/**
 * The fields an agent copies onto a Director composition, with the
 * composition's own names (shared/director/beat-grid.ts): `bpm`,
 * `beatOffsetSeconds` (a downbeat, in [0, one bar)) and `beatsPerBar`.
 */
export type CompositionBeatFields = Required<
  Pick<Project["composition"], "bpm" | "beatOffsetSeconds" | "beatsPerBar">
>;

export interface BandOnsets {
  /** Under about 150 Hz. */
  kick: number[];
  /** About 200 Hz to 5 kHz. */
  snare: number[];
  /** Above 5 kHz. */
  hat: number[];
  truncated: boolean;
}

export interface IntensityCurve {
  stepSeconds: number;
  /** RMS level in dBFS mapped to 0 to 1 between `floorDb` and `peakDb`. */
  values: number[];
  peakDb: number;
  floorDb: number;
}

export interface KeyMoment {
  kind: "build-up" | "crescendo" | "drop";
  startSeconds: number;
  endSeconds: number;
  /** The rise or jump in dB the moment was found by. */
  changeDb: number;
}

export type LibrosaStatus = "not-requested" | "unavailable" | "failed" | "used";

/** The librosa worker's view, in the same shapes as the core report. */
export interface LibrosaPart {
  status: LibrosaStatus;
  /** A fixed failure code when status is `failed`. */
  code?: string;
  version?: string;
  beatFound?: boolean;
  grid?: BeatGridReport | null;
  downbeat?: DownbeatEstimate | null;
  composition?: CompositionBeatFields | null;
  onsets?: BandOnsets;
  /** Section boundaries from MFCC clustering. */
  sections?: number[];
}

export interface AudioAnalysisReport {
  version: typeof AUDIO_ANALYSIS_VERSION;
  durationSeconds: number;
  sampleRate: number;
  /**
   * False when too few tracked beats land on a detected onset (a sustained
   * tone, a drone, silence): then grid, downbeat and composition are null.
   */
  beatFound: boolean;
  grid: BeatGridReport | null;
  downbeat: DownbeatEstimate | null;
  composition: CompositionBeatFields | null;
  onsets: BandOnsets;
  intensity: IntensityCurve;
  moments: KeyMoment[];
  librosa: LibrosaPart;
}

export const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;
const round = (value: number, places: number) =>
  Math.round(value * 10 ** places) / 10 ** places;

export interface FittedLine {
  /** Time of beat index 0 and seconds per beat. */
  offset: number;
  period: number;
  /** Each detected beat's index on the line, and whether the fit kept it. */
  indices: number[];
  kept: boolean[];
  residualMs: number;
}

/**
 * Least squares over detected beats: each beat gets an index by counting
 * periods from the last beat that fell on one (`countBeats`), then
 * time = offset + index × period, and the indices are counted again from
 * each fitted line. Beats
 * further than three robust deviations (and 15 ms) from the line are dropped
 * and the line refitted, so a missed or doubled beat does not tilt it.
 */
export function fitGrid(beats: number[]): FittedLine | null {
  if (beats.length < 4) return null;
  const gaps = beats.slice(1).map((t, i) => t - beats[i]);
  const guess = median(gaps);
  if (!(guess > 0)) return null;
  let { indices, kept } = countBeats(beats, guess);
  if (kept.filter(Boolean).length < 4) return null;
  let line = { offset: beats[0], period: guess };
  for (let pass = 0; pass < 3; pass++) {
    line = leastSquares(beats, indices, kept) ?? line;
    // Re-count from the fitted line, so a small error in the first guess
    // does not add up over a long track.
    indices = beats.map((t) => Math.round((t - line.offset) / line.period));
    const errors = beats.map((t, i) =>
      Math.abs(t - line.offset - indices[i] * line.period),
    );
    const spread = 1.4826 * median(errors.filter((_, i) => kept[i]));
    const next = errors.map((e) => e <= Math.max(3 * spread, 0.015));
    if (next.filter(Boolean).length < 4) break;
    kept = next;
  }
  const residuals = beats
    .map((t, i) => Math.abs(t - line.offset - indices[i] * line.period))
    .filter((_, i) => kept[i]);
  return { ...line, indices, kept, residualMs: median(residuals) * 1000 };
}

/**
 * Indices by whole periods from the last accepted beat. A detection more
 * than a quarter period off a whole count (a half-beat, a flam) is set
 * aside rather than given an index, so it cannot shift every later beat;
 * counting from the last accepted beat, not from the first, keeps a small
 * error in the period from adding up. In case the first detection is itself
 * off the beat, each of the first few is tried as the start, and the start
 * that accepts the most beats wins.
 */
function countBeats(beats: number[], period: number) {
  let best = { indices: beats.map(() => 0), kept: beats.map(() => false) };
  let bestCount = 0;
  for (let start = 0; start < Math.min(5, beats.length); start++) {
    const indices = beats.map(() => 0),
      kept = beats.map(() => false);
    let anchor = start,
      count = 1;
    kept[start] = true;
    for (let i = start + 1; i < beats.length; i++) {
      const ratio = (beats[i] - beats[anchor]) / period;
      const whole = Math.round(ratio);
      if (whole < 1 || Math.abs(ratio - whole) > 0.25) continue;
      indices[i] = indices[anchor] + whole;
      kept[i] = true;
      anchor = i;
      count++;
    }
    // Beats before the start are counted back from it the same way.
    anchor = start;
    for (let i = start - 1; i >= 0; i--) {
      const ratio = (beats[anchor] - beats[i]) / period;
      const whole = Math.round(ratio);
      if (whole < 1 || Math.abs(ratio - whole) > 0.25) continue;
      indices[i] = indices[anchor] - whole;
      kept[i] = true;
      anchor = i;
      count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = { indices, kept };
    }
  }
  return best;
}

function leastSquares(times: number[], indices: number[], kept: boolean[]) {
  let n = 0,
    sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  times.forEach((t, i) => {
    if (!kept[i]) return;
    n++;
    sx += indices[i];
    sy += t;
    sxx += indices[i] * indices[i];
    sxy += indices[i] * t;
  });
  const denominator = n * sxx - sx * sx;
  if (n < 2 || denominator === 0) return null;
  const period = (n * sxy - sx * sy) / denominator;
  return { period, offset: (sy - period * sx) / n };
}

/**
 * The grid, downbeat and composition fields from detected beats and the
 * low-band energy at each, shared by the core analysis and the librosa part.
 */
export function gridFromBeats(
  beats: number[],
  lowEnergy: number[],
  beatsPerBar = DEFAULT_BEATS_PER_BAR,
) {
  const line = fitGrid(beats);
  if (!line || !(line.period > 0.25 && line.period < 1.5))
    return { grid: null, downbeat: null, composition: null };
  const { period } = line;
  // Re-index so beat 0 is the first grid beat at or after 0 s.
  const shift = Math.floor(line.offset / period);
  const first = line.offset - shift * period;
  const fitted = line.kept.filter(Boolean).length;
  const grid: BeatGridReport = {
    // Unrounded: 1,200 beats at 60.0049 BPM rounded to 60 put the last
    // beat about 98 ms late. Round only where a person reads it.
    bpm: 60 / period,
    periodSeconds: period,
    firstBeatSeconds: ms(first),
    beatsPerBar,
    detectedBeats: beats.length,
    fittedBeats: fitted,
    residualMs: round(line.residualMs, 1),
    confidence: round(
      (fitted / beats.length) * Math.max(0, 1 - line.residualMs / 50),
      2,
    ),
  };
  const sums = new Array<number>(beatsPerBar).fill(0),
    counts = new Array<number>(beatsPerBar).fill(0);
  line.indices.forEach((index, i) => {
    if (!line.kept[i] || !Number.isFinite(lowEnergy[i])) return;
    const phase = (((index + shift) % beatsPerBar) + beatsPerBar) % beatsPerBar;
    sums[phase] += lowEnergy[i];
    counts[phase]++;
  });
  const means = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  const order = means.map((_, i) => i).sort((a, b) => means[b] - means[a]);
  const [best, next] = order;
  const contrast =
    means[best] > 0 ? means[best] / Math.max(means[next] ?? 0, 1e-12) : 1;
  const downbeat: DownbeatEstimate = {
    estimate: true,
    firstDownbeatSeconds: ms(first + best * period),
    contrast: round(Math.min(contrast, 99), 2),
    confidence: round(Math.max(0, Math.min(1, (contrast - 1) / 0.5)), 2),
    method: "low-band energy per beat",
  };
  return {
    grid,
    downbeat,
    composition: {
      bpm: grid.bpm,
      beatOffsetSeconds: downbeat.firstDownbeatSeconds,
      beatsPerBar,
    } satisfies CompositionBeatFields,
  };
}

/** A beat counts as heard when an onset in any band lies this close. */
const ONSET_SUPPORT_SECONDS = 0.05;
/** At least this many beats on onsets, and at least this share of them. */
const MIN_SUPPORTED_BEATS = 4;
const MIN_SUPPORTED_SHARE = 0.5;

/**
 * `gridFromBeats`, but only with onset evidence. A beat tracker finds a
 * period in any steady texture, so a sustained tone would otherwise get a
 * tidy grid; here at least four beats, and half of them, must land within
 * 50 ms of a detected onset, and the grid's confidence is scaled by that
 * share. Otherwise no beat was found.
 */
export function gridWithEvidence(
  beats: number[],
  lowEnergy: number[],
  onsets: number[],
  beatsPerBar = DEFAULT_BEATS_PER_BAR,
) {
  const heard = [...onsets].sort((a, b) => a - b);
  const supported = beats.filter(
    (t) => distance(heard, t) <= ONSET_SUPPORT_SECONDS,
  ).length;
  const share = beats.length ? supported / beats.length : 0;
  const result =
    supported >= MIN_SUPPORTED_BEATS && share >= MIN_SUPPORTED_SHARE
      ? gridFromBeats(beats, lowEnergy, beatsPerBar)
      : null;
  if (!result?.grid)
    return { beatFound: false, grid: null, downbeat: null, composition: null };
  result.grid.confidence = round(result.grid.confidence * share, 2);
  return { beatFound: true, ...result };
}

/** Distance from `t` to the nearest value of a sorted list. */
function distance(sorted: number[], t: number) {
  let low = 0,
    high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] < t) low = mid + 1;
    else high = mid;
  }
  return Math.min(
    low < sorted.length ? sorted[low] - t : Infinity,
    low > 0 ? t - sorted[low - 1] : Infinity,
  );
}
