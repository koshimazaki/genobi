/**
 * The Sound panel's meter maths: band levels from a live analyser, peak
 * hold, the precomputed envelopes at a frame, and the spectrogram's heat
 * colours. Pure, so the scopes and the transport strip read the same numbers.
 *
 * Ported from Holodeck's AudioEngine and SignalScopes
 * (src/audio/AudioEngine.ts, src/components/audio/SignalScopes.tsx, MIT;
 * notice in Holodeck-LICENSE.txt).
 */
import type { Recipe } from "./recipe";

export const METER_BANDS = ["low", "mid", "high", "level"] as const;
export type MeterBand = (typeof METER_BANDS)[number];
export type BandLevels = Record<MeterBand, number>;

export const silence = (): BandLevels => ({
  low: 0,
  mid: 0,
  high: 0,
  level: 0,
});

/** RMS of normalised audio is small, so the overall level gets a boost. */
const LEVEL_GAIN = 1.7;
/** Wide-band averaging dilutes each band; lift it into a usable range. */
const BAND_GAIN = 1.5;
/** Holodeck's live band edges, in Hz. */
export const BAND_RANGES = {
  low: [20, 160],
  mid: [160, 2000],
  high: [2000, 8000],
} as const;

const clamp01 = (v: number) => (v > 1 ? 1 : v > 0 ? v : 0);

/** Mean magnitude of the FFT bins between two frequencies, lifted and clamped. */
export function bandLevel(
  freq: ArrayLike<number>,
  sampleRate: number,
  [minHz, maxHz]: readonly [number, number],
) {
  if (!freq.length) return 0;
  const nyquist = sampleRate / 2;
  const start = Math.max(0, Math.floor((minHz / nyquist) * freq.length));
  const end = Math.min(
    freq.length - 1,
    Math.ceil((maxHz / nyquist) * freq.length),
  );
  let sum = 0,
    count = 0;
  for (let i = start; i <= end; i++) {
    sum += freq[i] / 255;
    count++;
  }
  return count ? clamp01((sum / count) * BAND_GAIN) : 0;
}

/** RMS of 8-bit time-domain samples centred on 128, lifted and clamped. */
export function rmsLevel(time: ArrayLike<number>) {
  if (!time.length) return 0;
  let sum = 0;
  for (let i = 0; i < time.length; i++) {
    const x = (time[i] - 128) / 128;
    sum += x * x;
  }
  return clamp01(Math.sqrt(sum / time.length) * LEVEL_GAIN);
}

/** One analyser read as the four meter bands. */
export function liveLevels(
  freq: ArrayLike<number>,
  time: ArrayLike<number>,
  sampleRate: number,
): BandLevels {
  return {
    low: bandLevel(freq, sampleRate, BAND_RANGES.low),
    mid: bandLevel(freq, sampleRate, BAND_RANGES.mid),
    high: bandLevel(freq, sampleRate, BAND_RANGES.high),
    level: rmsLevel(time),
  };
}

/** The recipe's precomputed envelopes at one frame: what a take is driven by. */
export function envelopeLevels(recipe: Recipe, frame: number): BandLevels {
  const at = (data: number[]) => clamp01(data[frame] ?? 0);
  return {
    low: at(recipe.bandEnvelopes.low),
    mid: at(recipe.bandEnvelopes.mid),
    high: at(recipe.bandEnvelopes.high),
    level: at(recipe.envelope),
  };
}

/** Move `from` toward `to` by `amount` (0 keeps, 1 jumps), in place. */
export function easeLevels(from: BandLevels, to: BandLevels, amount: number) {
  const k = clamp01(amount);
  for (const band of METER_BANDS) from[band] += (to[band] - from[band]) * k;
  return from;
}

/** How fast a held peak falls, in meter heights per second (Holodeck's 0.004 a frame at 60 fps). */
export const PEAK_FALL = 0.24;

/**
 * Peak hold: a new peak is held where it lands, then falls at `fall` per
 * second, never below the live value. `seconds` is the time since the last
 * read, so the fall is the same at any frame rate.
 */
export function holdPeak(
  held: number,
  value: number,
  seconds: number,
  fall = PEAK_FALL,
) {
  const v = clamp01(value);
  if (v >= held) return v;
  return Math.max(v, held - fall * Math.max(0, seconds));
}

export type Rgb = readonly [number, number, number];
export type HeatPalette = Record<
  "cold" | "low" | "mid" | "high" | "hot" | "peak",
  Rgb
>;

/** Used when the panel's CSS defines no `--spec-heat-*` colours. */
export const FALLBACK_HEAT: HeatPalette = {
  cold: [23, 26, 30],
  low: [111, 170, 182],
  mid: [168, 190, 92],
  high: [224, 189, 114],
  hot: [234, 123, 123],
  peak: [192, 214, 114],
};

/** A CSS `#rgb`, `#rrggbb` or `rgb()/rgba()` colour, or null. */
export function parseColor(value: string): Rgb | null {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)?.[1];
  if (hex) {
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  const parts = /^rgba?\(([^)]+)\)$/i
    .exec(text)?.[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(Number);
  if (!parts || parts.length < 3 || parts.some((n) => !Number.isFinite(n)))
    return null;
  return parts.map((n) => Math.round(n)) as unknown as Rgb;
}

const STOPS: [number, keyof HeatPalette][] = [
  [0, "cold"],
  [0.2, "low"],
  [0.48, "mid"],
  [0.7, "high"],
  [0.88, "hot"],
  [1, "peak"],
];
/** A magnitude (0 to 1) as the spectrogram's heat colour. */
export function heat(magnitude: number, palette: HeatPalette): Rgb {
  const v = clamp01(magnitude);
  for (let i = 1; i < STOPS.length; i++) {
    const [at, name] = STOPS[i];
    if (v <= at) {
      const [from, fromName] = STOPS[i - 1];
      const t = (v - from) / (at - from || 1);
      const a = palette[fromName],
        b = palette[name];
      return [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * t)) as [
        number,
        number,
        number,
      ];
    }
  }
  return palette.peak;
}
