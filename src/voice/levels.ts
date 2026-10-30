/**
 * The LED waveform's levels, as WIE's voice-feedback composer computes them
 * and X Console's `VoiceLevels` carries them: an RMS and peak blend, a small
 * noise gate, then a gentle curve so quiet speech still lifts the LEDs.
 * Pure, so the tests run it without a microphone.
 */
export const LED_COUNT = 48;
/** Meter frames per second, as X Console's DSP hop (sample rate / 24). */
export const METER_HZ = 24;

/** RMS and peak of one block of time-domain samples. */
export function measure(samples: Float32Array) {
  let sum = 0,
    peak = 0;
  for (const sample of samples) {
    const value = Number.isFinite(sample) ? Math.abs(sample) : 0;
    sum += value * value;
    if (value > peak) peak = value;
  }
  return { rms: samples.length ? Math.sqrt(sum / samples.length) : 0, peak };
}

/** WIE's level: `rms × 0.78 + peak × 0.22`, gate 0.006, `(x × 7.5)^0.72`. */
export function ledLevel(rms: number, peak: number): number {
  const r = Number.isFinite(rms) ? Math.max(0, rms) : 0;
  const p = Number.isFinite(peak) ? Math.max(0, Math.min(1, peak)) : 0;
  const gated = Math.max(0, r * 0.78 + p * 0.22 - 0.006);
  return Math.min(1, Math.pow(gated * 7.5, 0.72));
}

/** Oldest first; the newest level enters on the right, beside the mic. */
export function pushLevel(levels: Float32Array, value: number) {
  levels.copyWithin(0, 1);
  levels[levels.length - 1] = Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

/**
 * Eases the shown levels towards the heard ones at WIE's 0.24 per 60 Hz
 * frame, whatever the display's refresh rate. `immediate` is reduced motion.
 */
export function ease(
  shown: Float32Array,
  target: Float32Array,
  elapsedSeconds: number,
  immediate: boolean,
) {
  const frames = Math.min(0.25, Math.max(0, elapsedSeconds)) * 60;
  const rate = immediate ? 1 : 1 - Math.pow(1 - 0.24, frames);
  for (let i = 0; i < shown.length; i++)
    shown[i] += ((target[i] ?? 0) - shown[i]) * rate;
}

export type Rgb = [number, number, number];

/** `#rgb`, `#rrggbb` (alpha ignored) or `rgb(r, g, b)`; null otherwise. */
export function parseColor(value: string): Rgb | null {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text)?.[1];
  if (hex) {
    const full =
      hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/** `steps` colours evenly between the theme's stops, quiet to loud. */
export function ramp(stops: readonly Rgb[], steps = 32): Rgb[] {
  if (stops.length < 2) return [stops[0] ?? [255, 255, 255]];
  return Array.from({ length: steps }, (_, step) => {
    const position = (step / (steps - 1)) * (stops.length - 1);
    const lower = Math.min(stops.length - 2, Math.floor(position));
    const t = position - lower;
    const [a, b] = [stops[lower], stops[lower + 1]];
    return a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb;
  });
}
