/**
 * Tempo and raw beats from an onset envelope: a tempo-weighted
 * autocorrelation picks the beat period, then dynamic programming (Ellis,
 * "Beat tracking by dynamic programming", 2007, the method librosa's
 * `beat_track` uses) places beats on strong onsets spaced close to it. Raw
 * beats wobble; `fitGrid` in audio-report.ts straightens them.
 */

/** The tempo range searched; a composition takes 20 to 300 BPM. */
export const MIN_BPM = 60;
export const MAX_BPM = 200;
/** Tempo prior: a log-normal around 120 BPM, one octave wide, as in librosa. */
const PRIOR_BPM = 120;
const TIGHTNESS = 100;

/** The envelope minus its local mean, half-wave rectified, at unit spread. */
export function normaliseEnvelope(flux: Float32Array, frameRate: number) {
  const radius = Math.max(1, Math.round(frameRate * 0.2));
  const out = new Float32Array(flux.length);
  let sum = 0;
  for (let i = 0; i < Math.min(flux.length, radius); i++) sum += flux[i];
  for (let i = 0; i < flux.length; i++) {
    if (i + radius < flux.length) sum += flux[i + radius];
    if (i - radius - 1 >= 0) sum -= flux[i - radius - 1];
    const count =
      Math.min(flux.length - 1, i + radius) - Math.max(0, i - radius) + 1;
    out[i] = Math.max(0, flux[i] - sum / count);
  }
  let square = 0;
  for (const v of out) square += v * v;
  const spread = Math.sqrt(square / Math.max(1, out.length));
  if (spread < 1e-6) return null;
  for (let i = 0; i < out.length; i++) out[i] /= spread;
  return out;
}

/**
 * The beat period in frames, refined between lags, and how periodic the
 * envelope is there (autocorrelation over energy, 0 to 1).
 */
export function estimateTempo(envelope: Float32Array, frameRate: number) {
  const shortest = Math.floor((60 * frameRate) / MAX_BPM);
  const longest = Math.ceil((60 * frameRate) / MIN_BPM);
  if (envelope.length < longest * 4) return null;
  const ac = new Float64Array(longest + 2);
  for (let lag = 0; lag < ac.length; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < envelope.length; i++)
      sum += envelope[i] * envelope[i + lag];
    ac[lag] = sum / (envelope.length - lag);
  }
  if (ac[0] <= 0) return null;
  let best = -1,
    bestScore = -Infinity;
  for (let lag = shortest; lag <= longest; lag++) {
    const bpm = (60 * frameRate) / lag;
    const weight = Math.exp(-0.5 * Math.log2(bpm / PRIOR_BPM) ** 2);
    const peak = ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1];
    if (peak && ac[lag] * weight > bestScore) {
      bestScore = ac[lag] * weight;
      best = lag;
    }
  }
  if (best < 0) return null;
  return {
    period: best + vertex(ac[best - 1], ac[best], ac[best + 1]),
    strength: Math.max(0, Math.min(1, ac[best] / ac[0])),
  };
}

/** Offset of a parabola's vertex through three equally spaced points. */
export function vertex(left: number, centre: number, right: number) {
  const curve = left - 2 * centre + right;
  if (curve >= 0) return 0;
  return Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / curve));
}

/** Beat positions in frames (fractional), first to last. */
export function trackBeats(envelope: Float32Array, period: number) {
  const n = envelope.length;
  const local = smooth(envelope, period / 32);
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const near = Math.max(1, Math.round(period / 2)),
    far = Math.round(period * 2);
  for (let i = 0; i < n; i++) {
    let best = -Infinity,
      from = -1;
    for (let j = Math.max(0, i - far); j <= i - near; j++) {
      const candidate = score[j] - TIGHTNESS * Math.log((i - j) / period) ** 2;
      if (candidate > best) {
        best = candidate;
        from = j;
      }
    }
    // The first beat starts a chain; a weak predecessor is not worth taking.
    score[i] = local[i] + (from >= 0 && best > 0 ? best : 0);
    back[i] = from >= 0 && best > 0 ? from : -1;
  }
  const maxima: number[] = [];
  for (let i = 1; i < n - 1; i++)
    if (score[i] > score[i - 1] && score[i] >= score[i + 1]) maxima.push(i);
  if (!maxima.length) return [];
  const threshold = 0.5 * median(maxima.map((i) => score[i]));
  let last = maxima[maxima.length - 1];
  for (let k = maxima.length - 1; k >= 0; k--)
    if (score[maxima[k]] >= threshold) {
      last = maxima[k];
      break;
    }
  const beats: number[] = [];
  for (let i = last; i >= 0; i = back[i]) beats.push(i);
  beats.reverse();
  // Beats on silence at either end are the chain coasting, not the music.
  const strength = Math.sqrt(
    beats.reduce((sum, b) => sum + local[b] * local[b], 0) /
      Math.max(1, beats.length),
  );
  let first = 0,
    end = beats.length;
  while (first < end && local[beats[first]] < 0.5 * strength) first++;
  while (end > first && local[beats[end - 1]] < 0.5 * strength) end--;
  return beats
    .slice(first, end)
    .map((b) =>
      b > 0 && b < n - 1 ? b + vertex(local[b - 1], local[b], local[b + 1]) : b,
    );
}

/** A Gaussian blur of `sigma` frames, at least one frame wide. */
function smooth(values: Float32Array, sigma: number) {
  const s = Math.max(0.5, sigma),
    radius = Math.ceil(3 * s);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, i) =>
    Math.exp(-0.5 * ((i - radius) / s) ** 2),
  );
  const total = kernel.reduce((a, b) => a + b, 0);
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const at = i + k;
      if (at >= 0 && at < values.length) sum += values[at] * kernel[k + radius];
    }
    out[i] = sum / total;
  }
  return out;
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
