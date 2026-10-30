/**
 * The signal side of audio analysis: a short-time Fourier transform over mono
 * PCM, spectral flux per band, and band and loudness levels. Pure functions
 * over sample arrays, with no Node or DOM API, so the local server and any
 * later adapter run the same numbers.
 */

/** Samples per frame and between frames: 46 ms windows every 11.6 ms at 22.05 kHz. */
export const FFT_SIZE = 1024;
export const HOP = 256;

/**
 * Frequency bands in hertz. The kick sits under about 150 Hz; the snare's
 * body and crack in the mid band; hats and cymbals above it. A kick's beater
 * click can also reach the snare band, so a band onset is where that band's
 * flux peaks, not a drum transcription.
 */
export const BANDS = {
  kick: [30, 150],
  snare: [200, 5000],
  hat: [5000, 11025],
} as const;
export type Band = keyof typeof BANDS;
export const BAND_NAMES = Object.keys(BANDS) as Band[];

export interface SpectralFeatures {
  /** Frames per second; frame i is centred on sample i × HOP. */
  frameRate: number;
  frames: number;
  /** Positive change of log magnitude, averaged over each band's bins. */
  flux: Record<Band | "all", Float32Array>;
  /** Power under 150 Hz per frame, for downbeats and drops. */
  lowPower: Float32Array;
  /** Power in each band per frame, to tell an attack from a steady tone. */
  bandPower: Record<Band, Float32Array>;
}

/** In-place iterative radix-2 FFT over a power-of-two length. */
export function makeFft(size: number) {
  const bits = Math.log2(size);
  if (!Number.isInteger(bits)) throw new Error("FFT size must be 2^n.");
  const reverse = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reverse[i] = r;
  }
  const cos = new Float64Array(size / 2),
    sin = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / size);
    sin[i] = Math.sin((-2 * Math.PI * i) / size);
  }
  return (re: Float64Array, im: Float64Array) => {
    for (let i = 0; i < size; i++) {
      const j = reverse[i];
      if (j > i) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let length = 2; length <= size; length *= 2) {
      const half = length / 2,
        step = size / length;
      for (let start = 0; start < size; start += length)
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step],
            wi = sin[k * step];
          const a = start + k,
            b = a + half;
          const xr = re[b] * wr - im[b] * wi,
            xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
    }
  };
}

/** The bins [first, last) a band covers at this rate, at least one bin wide. */
function binRange(band: readonly [number, number], sampleRate: number) {
  const width = sampleRate / FFT_SIZE;
  const first = Math.max(1, Math.round(band[0] / width));
  const last = Math.min(FFT_SIZE / 2 + 1, Math.round(band[1] / width) + 1);
  return [first, Math.max(first + 1, last)] as const;
}

/**
 * One pass of centred, Hann-windowed frames. Magnitudes are scaled so a
 * full-scale sine reads about 1, then compressed with log(1 + 1000·m), so
 * quiet passages still show their attacks.
 */
export function spectralFeatures(
  samples: Float32Array,
  sampleRate: number,
): SpectralFeatures {
  const frames = Math.floor(samples.length / HOP) + 1;
  const fft = makeFft(FFT_SIZE);
  const window = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++)
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);
  const re = new Float64Array(FFT_SIZE),
    im = new Float64Array(FFT_SIZE);
  const bins = FFT_SIZE / 2 + 1;
  let previous = new Float64Array(bins),
    current = new Float64Array(bins);
  const ranges = Object.fromEntries(
    BAND_NAMES.map((name) => [name, binRange(BANDS[name], sampleRate)]),
  ) as Record<Band, readonly [number, number]>;
  const low = binRange([0, 150], sampleRate);
  const flux = {
    all: new Float32Array(frames),
    ...Object.fromEntries(
      BAND_NAMES.map((name) => [name, new Float32Array(frames)]),
    ),
  } as SpectralFeatures["flux"];
  const lowPower = new Float32Array(frames);
  const bandPower = Object.fromEntries(
    BAND_NAMES.map((name) => [name, new Float32Array(frames)]),
  ) as Record<Band, Float32Array>;
  const powers = new Float64Array(bins);
  const scale = 4 / FFT_SIZE;
  for (let frame = 0; frame < frames; frame++) {
    const start = frame * HOP - FFT_SIZE / 2;
    for (let i = 0; i < FFT_SIZE; i++) {
      const at = start + i;
      re[i] = at >= 0 && at < samples.length ? samples[at] * window[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    let power = 0;
    for (let k = 0; k < bins; k++) {
      const magnitude = Math.hypot(re[k], im[k]) * scale;
      current[k] = Math.log1p(1000 * magnitude);
      powers[k] = magnitude * magnitude;
      if (k >= low[0] && k < low[1]) power += powers[k];
    }
    lowPower[frame] = power;
    for (const name of BAND_NAMES) {
      const [first, last] = ranges[name];
      let sum = 0;
      for (let k = first; k < last; k++) sum += powers[k];
      bandPower[name][frame] = sum;
    }
    if (frame > 0) {
      let total = 0;
      for (let k = 1; k < bins; k++)
        total += Math.max(0, current[k] - previous[k]);
      flux.all[frame] = total / (bins - 1);
      for (const name of BAND_NAMES) {
        const [first, last] = ranges[name];
        let sum = 0;
        for (let k = first; k < last; k++)
          sum += Math.max(0, current[k] - previous[k]);
        flux[name][frame] = sum / (last - first);
      }
    }
    [previous, current] = [current, previous];
  }
  return { frameRate: sampleRate / HOP, frames, flux, lowPower, bandPower };
}

/** Loudness in dBFS per step of `stepSeconds`, from the samples' RMS. */
export function levelCurve(
  samples: Float32Array,
  sampleRate: number,
  stepSeconds: number,
) {
  const step = Math.max(1, Math.round(stepSeconds * sampleRate));
  const out = new Float32Array(Math.ceil(samples.length / step));
  for (let i = 0; i < out.length; i++) {
    const end = Math.min(samples.length, (i + 1) * step);
    let sum = 0;
    for (let j = i * step; j < end; j++) sum += samples[j] * samples[j];
    out[i] = decibels(Math.sqrt(sum / Math.max(1, end - i * step)));
  }
  return out;
}

/** Frame values averaged into steps of `stepSeconds`, in decibels of power. */
export function stepPower(
  power: Float32Array,
  frameRate: number,
  stepSeconds: number,
  steps: number,
) {
  const out = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const first = Math.floor(i * stepSeconds * frameRate);
    const last = Math.min(
      power.length,
      Math.max(first + 1, Math.floor((i + 1) * stepSeconds * frameRate)),
    );
    let sum = 0;
    for (let f = first; f < last; f++) sum += power[f];
    out[i] = 10 * Math.log10(Math.max(1e-9, sum / Math.max(1, last - first)));
  }
  return out;
}

/** Amplitude to dBFS, floored at -90 so silence stays a number. */
export const decibels = (amplitude: number) =>
  Math.max(-90, 20 * Math.log10(Math.max(1e-12, amplitude)));
