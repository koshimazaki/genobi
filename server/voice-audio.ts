/**
 * Voice mode's audio rules, as pure functions over 16 kHz mono samples so the
 * tests run them without ffmpeg or Python.
 *
 * The chunker is X Console's: the model sees at most 28 seconds at a time, and
 * a cut prefers the quietest 20 ms in the last six seconds of a chunk. The
 * silence gate is new: X Console only skipped numerical silence, and on a
 * silent tail chunk Qwen3-ASR copied its dictionary context back as text
 * (measured 20 October 2026), so a chunk without enough voiced audio is never
 * sent to the model.
 */
export const SAMPLE_RATE = 16_000;
export const MAX_CHUNK_SECONDS = 28;
export const MIN_CHUNK_SECONDS = 22;
/** A quiet cut needs its 20 ms window's mean square at or under this. */
const QUIET_ENERGY = 0.0001;
const WINDOW_SECONDS = 0.02;
/**
 * A window is voiced when its WIE level (rms × 0.78 + peak × 0.22) clears
 * three times the recording's noise floor, kept between these bounds so a
 * near-silent room cannot lower it to hiss and a loud one cannot raise it past
 * speech.
 */
const VOICED_MIN = 0.012;
const VOICED_MAX = 0.05;
/** Voiced audio a chunk needs before the model sees it: about one short word. */
export const MIN_VOICED_SECONDS = 0.2;

export interface Chunk {
  /** Sample offsets, end exclusive. */
  start: number;
  end: number;
}

/**
 * Contiguous chunks with no overlap and nothing dropped. A chunk ends at the
 * middle of the quietest window between 22 and 28 seconds, or at 28 seconds
 * when no window there is quiet.
 */
export function chunkRanges(samples: Float32Array): Chunk[] {
  const length = samples.length;
  const maximum = MAX_CHUNK_SECONDS * SAMPLE_RATE;
  const minimum = MIN_CHUNK_SECONDS * SAMPLE_RATE;
  const step = WINDOW_SECONDS * SAMPLE_RATE;
  const chunks: Chunk[] = [];
  let start = 0;
  while (length - start > maximum) {
    let quietest = -1,
      lowest = Infinity;
    for (let at = start + minimum; at + step <= start + maximum; at += step) {
      const energy = meanSquare(samples, at, at + step);
      if (energy < lowest) {
        lowest = energy;
        quietest = at;
      }
    }
    const cut =
      quietest >= 0 && lowest <= QUIET_ENERGY
        ? quietest + step / 2
        : start + maximum;
    chunks.push({ start, end: cut });
    start = cut;
  }
  if (length > start) chunks.push({ start, end: length });
  return chunks;
}

function meanSquare(samples: Float32Array, from: number, to: number) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return to > from ? sum / (to - from) : 0;
}

/** The WIE level of each 20 ms window: rms × 0.78 + peak × 0.22. */
export function windowLevels(samples: Float32Array): Float32Array {
  const step = WINDOW_SECONDS * SAMPLE_RATE;
  const levels = new Float32Array(Math.floor(samples.length / step));
  for (let w = 0; w < levels.length; w++) {
    let sum = 0,
      peak = 0;
    for (let i = w * step; i < (w + 1) * step; i++) {
      const value = Math.abs(samples[i]);
      sum += value * value;
      if (value > peak) peak = value;
    }
    levels[w] = Math.sqrt(sum / step) * 0.78 + Math.min(1, peak) * 0.22;
  }
  return levels;
}

/** The level a window must clear to count as voiced in this recording. */
export function voicedThreshold(levels: Float32Array): number {
  if (!levels.length) return VOICED_MIN;
  // The quietest fifth of the recording stands for the room.
  const floor =
    Float32Array.from(levels).sort()[Math.floor(levels.length * 0.2)];
  return Math.min(VOICED_MAX, Math.max(VOICED_MIN, floor * 3));
}

/**
 * Whether a chunk holds enough voiced audio for the model. `threshold` comes
 * from the whole recording, so a quiet tail is judged against the same room.
 */
export function hasSpeech(
  samples: Float32Array,
  chunk: Chunk,
  threshold: number,
): boolean {
  const levels = windowLevels(samples.subarray(chunk.start, chunk.end));
  const needed = Math.ceil(MIN_VOICED_SECONDS / WINDOW_SECONDS);
  let voiced = 0;
  for (const level of levels)
    if (level >= threshold && ++voiced >= needed) return true;
  return false;
}

/** Splits a recording and marks which chunks the model should hear. */
export function planChunks(samples: Float32Array) {
  const threshold = voicedThreshold(windowLevels(samples));
  return chunkRanges(samples).map((chunk) => ({
    ...chunk,
    speech: hasSpeech(samples, chunk, threshold),
  }));
}

/** Little-endian float32 PCM, as ffmpeg's `f32le` writes it. */
export function readFloat32(bytes: Uint8Array): Float32Array {
  const count = Math.floor(bytes.byteLength / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 4);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const value = view.getFloat32(i * 4, true);
    samples[i] = Number.isFinite(value) ? value : 0;
  }
  return samples;
}
