/** Earlier takes stored up to 241 full-precision samples per measured band. */
export const FULL_PRECISION_AUDIO_FRAMES = 241;

/**
 * Compact only newly prepared longer signals. The same bounded values feed
 * preview, saved recipes and capture; short analyses retain their exact values.
 * Rounding to four decimals changes a normalized sample by at most 0.00005.
 */
export function compactAudioEnvelope(samples: number[]): number[] {
  return samples.length <= FULL_PRECISION_AUDIO_FRAMES
    ? samples
    : samples.map((value) => Math.round(value * 10_000) / 10_000);
}
