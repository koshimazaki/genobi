/** Offline envelope contract. Old recipes legitimately have no measured sub band. */
export interface BandEnvelopes {
  low: number[];
  mid: number[];
  high: number[];
  sub?: number[];
}

const BANDS = ["low", "mid", "high", "sub"] as const;
const validEnvelope = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length <= TAKE_FRAMES.max &&
  value.every(
    (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
  );

/** A missing sub band means silence until the actual audio is analysed again. */
export function normalizeBandEnvelopes(
  value: unknown,
): Required<BandEnvelopes> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid audio routing.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !BANDS.includes(key as (typeof BANDS)[number]),
    ) ||
    !["low", "mid", "high"].every(
      (key) => Object.hasOwn(input, key) && validEnvelope(input[key]),
    ) ||
    (Object.hasOwn(input, "sub") && !validEnvelope(input.sub))
  )
    throw new Error("Invalid audio routing.");
  return {
    low: [...(input.low as number[])],
    mid: [...(input.mid as number[])],
    high: [...(input.high as number[])],
    sub: Object.hasOwn(input, "sub") ? [...(input.sub as number[])] : [],
  };
}

type Coefficients = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

/** Second-order Butterworth section; each cutoff has a finite roll-off. */
function coefficients(
  hz: number,
  sampleRate: number,
  highpass: boolean,
): Coefficients {
  const w = (2 * Math.PI * hz) / sampleRate,
    cosine = Math.cos(w),
    alpha = Math.sin(w) / Math.SQRT2,
    denominator = 1 + alpha,
    b = highpass ? 1 + cosine : 1 - cosine;
  return {
    b0: b / (2 * denominator),
    b1: (highpass ? -b : b) / denominator,
    b2: b / (2 * denominator),
    a1: (-2 * cosine) / denominator,
    a2: (1 - alpha) / denominator,
  };
}

function section(c: Coefficients) {
  let first = 0,
    second = 0;
  return (input: number) => {
    const output = c.b0 * input + first;
    first = c.b1 * input - c.a1 * output + second;
    second = c.b2 * input - c.a2 * output;
    return output;
  };
}

/** Shared exact coefficients for offline analysis and the live input graph. */
export function subBandSections(sampleRate: number) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 160)
    throw new Error("Invalid audio analysis rate.");
  return {
    highpass: coefficients(20, sampleRate, true),
    lowpass: coefficients(80, sampleRate, false),
  };
}

/**
 * Independently measured 20–80 Hz energy, never an alias of the low envelope.
 * A 20 Hz high-pass and 80 Hz low-pass feed channel-wise RMS on the same
 * bounded capture grid as the existing bands. The filter rolls off gradually;
 * this is a frequency band, not separation of a bass instrument or a kick.
 */
export function analyseSubBand(
  channels: Float32Array[],
  sampleRate: number,
  fps = 24,
) {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 160 ||
    !Number.isFinite(fps) ||
    fps <= 0
  )
    throw new Error("Invalid audio analysis rate.");
  const samples = channels[0]?.length ?? 0,
    length = Math.min(TAKE_FRAMES.max, Math.ceil((samples / sampleRate) * fps)),
    sums = new Float64Array(length);
  const { highpass, lowpass } = subBandSections(sampleRate);
  for (const channel of channels) {
    const high = section(highpass),
      low = section(lowpass);
    for (let frame = 0; frame < length; frame++) {
      const start = Math.floor((frame * sampleRate) / fps),
        end = Math.min(samples, Math.floor(((frame + 1) * sampleRate) / fps));
      for (let i = start; i < end; i++) {
        const value = low(high(channel[i] ?? 0));
        sums[frame] += value * value;
      }
    }
  }
  return compactAudioEnvelope(
    Array.from(sums, (sum, frame) => {
      const count =
        Math.min(samples, Math.floor(((frame + 1) * sampleRate) / fps)) -
        Math.floor((frame * sampleRate) / fps);
      return Math.min(1, Math.sqrt(sum / Math.max(1, count * channels.length)));
    }),
  );
}
import { TAKE_FRAMES } from "./take-duration";
import { compactAudioEnvelope } from "./audio-envelope";
