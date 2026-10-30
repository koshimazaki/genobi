import {
  BAND_NAMES,
  levelCurve,
  spectralFeatures,
  stepPower,
  type Band,
} from "./audio-dsp";
import {
  AUDIO_ANALYSIS_VERSION,
  gridWithEvidence,
  MAX_ONSETS,
  ms,
  type AudioAnalysisReport,
  type BandOnsets,
  type IntensityCurve,
  type KeyMoment,
} from "./audio-report";
import {
  estimateTempo,
  median,
  normaliseEnvelope,
  trackBeats,
  vertex,
} from "./audio-tempo";

/**
 * Genobi's own audio analysis, with no Python and no native library: tempo
 * and a fitted straight beat grid (only when the beats land on onsets), a
 * downbeat estimate, onsets per band
 * (kick, snare, hat) from spectral flux, an intensity curve, and key moments
 * (build-ups, crescendos, drops) from that curve. Input is mono PCM; the
 * local server decodes with ffmpeg first. The thresholds below are heuristics
 * checked on synthetic signals (tests/audio-analysis.test.ts), not tuned on a
 * corpus.
 */

/**
 * Spectral flux rises while an attack slides into the analysis window, so a
 * flux peak comes slightly before the attack. Measured on clicks and kicks:
 * the peak leads by 7 to 11 ms, and it is added back.
 */
const ONSET_LAG = 0.009;
/** Key moments are found on a 10 Hz level curve. */
const STEP = 0.1;
/** At most this many points on the reported curve. */
const MAX_CURVE_POINTS = 1000;

/** Input the analysis refuses, with a fixed code the server passes on. */
export class AudioInputError extends Error {
  constructor(
    readonly code: "audio_too_short" | "audio_not_finite",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Refuses rather than repairs: an IEEE-float WAV can carry NaN or Infinity,
 * ffmpeg keeps them in float32, and one would poison every sum after it.
 * The librosa worker refuses the same input (`invalid_audio`).
 */
export function analyseAudio(
  samples: Float32Array,
  sampleRate: number,
): AudioAnalysisReport {
  if (!(sampleRate >= 8000) || samples.length < sampleRate * 0.5)
    throw new AudioInputError(
      "audio_too_short",
      "Analyse at least half a second of audio.",
    );
  for (let i = 0; i < samples.length; i++)
    if (!Number.isFinite(samples[i]))
      throw new AudioInputError(
        "audio_not_finite",
        "This audio holds samples that are not numbers (NaN or infinity).",
      );
  const durationSeconds = samples.length / sampleRate;
  const features = spectralFeatures(samples, sampleRate);
  const { frameRate } = features;
  const time = (frame: number) => frame / frameRate + ONSET_LAG;

  const envelope = normaliseEnvelope(features.flux.all, frameRate);
  const tempo = envelope && estimateTempo(envelope, frameRate);
  const beatFrames = tempo ? trackBeats(envelope!, tempo.period) : [];
  const lowEnergy = beatFrames.map((frame) => {
    let peak = 0;
    for (let f = Math.round(frame) - 3; f <= Math.round(frame) + 3; f++)
      if (f >= 0 && f < features.frames)
        peak = Math.max(peak, features.lowPower[f]);
    return peak;
  });
  let truncated = false;
  const found = Object.fromEntries(
    BAND_NAMES.map((band) => [
      band,
      pickOnsets(features.flux[band], features.bandPower[band], frameRate).map(
        time,
      ),
    ]),
  ) as Record<Band, number[]>;
  const onsets = Object.fromEntries(
    BAND_NAMES.map((band) => {
      truncated ||= found[band].length > MAX_ONSETS;
      return [band, found[band].slice(0, MAX_ONSETS).map(ms)];
    }),
  ) as Record<Band, number[]>;
  const { beatFound, grid, downbeat, composition } = gridWithEvidence(
    beatFrames.map(time),
    lowEnergy,
    BAND_NAMES.flatMap((band) => found[band]),
  );

  const level = levelCurve(samples, sampleRate, STEP);
  const low = stepPower(features.lowPower, frameRate, STEP, level.length);
  const all = [...onsets.kick, ...onsets.snare, ...onsets.hat].sort(
    (a, b) => a - b,
  );
  return {
    version: AUDIO_ANALYSIS_VERSION,
    durationSeconds: ms(durationSeconds),
    sampleRate,
    beatFound,
    grid,
    downbeat,
    composition,
    onsets: { ...onsets, truncated } satisfies BandOnsets,
    intensity: intensityCurve(samples, sampleRate, durationSeconds),
    moments: keyMoments(level, low, all),
    librosa: { status: "not-requested" },
  };
}

/**
 * A flux peak is an onset only if the band's power over the next 46 ms is
 * at least this many times its power over the 200 ms before (ending 35 ms
 * back, clear of the attack's own window). A steady tone's flux still
 * ripples, most of all under 50 Hz where a cycle is longer than a frame;
 * its power does not rise, so it gives no onsets.
 */
export const ATTACK_RATIO = 1.5;

export function isAttack(power: Float32Array, i: number, frameRate: number) {
  const after = Math.max(1, Math.round(frameRate * 0.046)),
    gap = Math.max(1, Math.round(frameRate * 0.035)),
    before = Math.max(1, Math.round(frameRate * 0.2));
  let post = 0,
    pre = 0,
    count = 0;
  for (let f = i; f < Math.min(power.length, i + after); f++) post += power[f];
  post /= Math.max(1, Math.min(power.length, i + after) - i);
  for (let f = Math.max(0, i - gap - before); f < i - gap; f++) {
    pre += power[f];
    count++;
  }
  pre /= Math.max(1, count);
  return post > 1e-12 && post >= ATTACK_RATIO * pre;
}

/**
 * Peaks of one band's flux, normalised to its loudest: a local maximum over
 * ±35 ms, above the mean of the surrounding 200 ms by a margin, at least
 * 50 ms after the last onset, and a real attack in the band's power.
 */
export function pickOnsets(
  flux: Float32Array,
  power: Float32Array,
  frameRate: number,
) {
  let top = 0;
  for (const v of flux) top = Math.max(top, v);
  if (top < 1e-6) return [];
  const around = Math.max(1, Math.round(frameRate * 0.035)),
    mean = Math.max(1, Math.round(frameRate * 0.1)),
    wait = Math.max(1, Math.round(frameRate * 0.05));
  const found: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < flux.length - 1; i++) {
    const v = flux[i] / top;
    if (v < 0.1 || i - last < wait) continue;
    let peak = true;
    for (let j = Math.max(0, i - around); j <= i + around && peak; j++)
      if (j < flux.length && flux[j] > flux[i]) peak = false;
    if (!peak) continue;
    let sum = 0,
      count = 0;
    for (let j = Math.max(0, i - mean); j <= i + mean; j++)
      if (j < flux.length) {
        sum += flux[j] / top;
        count++;
      }
    if (v < sum / count + 0.07 || !isAttack(power, i, frameRate)) continue;
    found.push(i + vertex(flux[i - 1], flux[i], flux[i + 1]));
    last = i;
  }
  return found;
}

function intensityCurve(
  samples: Float32Array,
  sampleRate: number,
  durationSeconds: number,
): IntensityCurve {
  const stepSeconds = Math.max(
    STEP,
    Math.ceil(durationSeconds / MAX_CURVE_POINTS / STEP) * STEP,
  );
  const level = levelCurve(samples, sampleRate, stepSeconds);
  let peakDb = -90,
    lowest = 0;
  for (const db of level) {
    peakDb = Math.max(peakDb, db);
    lowest = Math.min(lowest, db);
  }
  const floorDb = Math.min(peakDb, Math.max(-60, lowest));
  const span = peakDb - floorDb;
  return {
    stepSeconds: Math.round(stepSeconds * 100) / 100,
    values: [...level].map((db) =>
      span > 0
        ? Math.round(Math.max(0, Math.min(1, (db - floorDb) / span)) * 1000) /
          1000
        : 0,
    ),
    peakDb: Math.round(peakDb * 10) / 10,
    floorDb: Math.round(floorDb * 10) / 10,
  };
}

const mean = (values: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += values[i];
  return sum / Math.max(1, to - from);
};

/**
 * Drops: the level over the next 2 s jumps by 6 dB or more over the 2 s
 * before (or the low band by 9 dB with the level up 3 dB), landing at or
 * above the track's median, at least 8 s apart. Rises: the 2 s-smoothed level
 * climbing faster than 0.5 dB/s. A rise that a drop follows within 2.5 s is a build-up
 * (4 dB or more); a rise without one, 4 s or longer and 6 dB or more, is a
 * crescendo.
 */
export function keyMoments(
  level: Float32Array,
  low: Float32Array,
  onsets: number[],
): KeyMoment[] {
  const n = level.length,
    window = Math.round(2 / STEP);
  // A short silence must not sink a 2 s average to -90 dB.
  level = level.map((db) => Math.max(db, -60));
  low = low.map((db) => Math.max(db, -60));
  const typical = median([...level]);
  const candidates: { at: number; jump: number }[] = [];
  for (let i = window; i + window <= n; i++) {
    const after = mean(level, i, i + window);
    const jump = after - mean(level, i - window, i);
    const lowJump = mean(low, i, i + window) - mean(low, i - window, i);
    if (after >= typical && (jump >= 6 || (lowJump >= 9 && jump >= 3)))
      candidates.push({ at: i, jump });
  }
  const drops: { at: number; jump: number }[] = [];
  for (const c of candidates) {
    const local = candidates.every(
      (o) => Math.abs(o.at - c.at) > window / 2 || o.jump <= c.jump,
    );
    if (!local) continue;
    const near = drops.findIndex((d) => Math.abs(d.at - c.at) * STEP < 8);
    if (near < 0) drops.push(c);
    else if (drops[near].jump < c.jump) drops[near] = c;
  }
  const snap = (seconds: number) => {
    const closest = onsets.reduce(
      (best, t) =>
        Math.abs(t - seconds) < Math.abs(best - seconds) ? t : best,
      Infinity,
    );
    return Math.abs(closest - seconds) <= 0.15 ? closest : seconds;
  };
  const moments: KeyMoment[] = drops.map((d) => {
    const at = ms(snap(d.at * STEP));
    return {
      kind: "drop",
      startSeconds: at,
      endSeconds: at,
      changeDb: Math.round(d.jump * 10) / 10,
    };
  });

  const smooth = new Float32Array(n);
  const half = Math.round(1 / STEP);
  for (let i = 0; i < n; i++)
    smooth[i] = mean(level, Math.max(0, i - half), Math.min(n, i + half + 1));
  const rising = (i: number) =>
    i >= half / 2 &&
    i + half / 2 < n &&
    smooth[i + half / 2] - smooth[i - half / 2] > 0.5 * (half * STEP);
  const runs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (!rising(i)) continue;
    const open = runs.at(-1);
    if (open && (i - open[1]) * STEP <= 1) open[1] = i;
    else runs.push([i, i]);
  }
  for (const [a, b] of runs) {
    const drop = moments.find(
      (m) =>
        m.kind === "drop" &&
        m.startSeconds >= a * STEP &&
        m.startSeconds <= b * STEP + 2.5,
    );
    if (drop) {
      const end = Math.max(a, Math.round(drop.startSeconds / STEP) - half);
      const rise = smooth[end] - smooth[a];
      if (drop.startSeconds - a * STEP >= 2 && rise >= 4)
        moments.push({
          kind: "build-up",
          startSeconds: ms(a * STEP),
          endSeconds: drop.startSeconds,
          changeDb: Math.round(rise * 10) / 10,
        });
      continue;
    }
    const rise = smooth[b] - smooth[a];
    if ((b - a) * STEP >= 4 && rise >= 6)
      moments.push({
        kind: "crescendo",
        startSeconds: ms(a * STEP),
        endSeconds: ms(b * STEP),
        changeDb: Math.round(rise * 10) / 10,
      });
  }
  return moments.sort((x, y) => x.startSeconds - y.startSeconds);
}
