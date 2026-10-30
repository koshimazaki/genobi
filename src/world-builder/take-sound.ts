import { audioWav } from "./audio";
import type { Recipe } from "./recipe";

/**
 * A take's dry sound, synthesised from its recipe so the same recipe always
 * gives the same bytes: a quiet room tone, a thump where a `hit` move
 * starts and a heavier body-on-the-floor thud where a `fall` move lands. It
 * is a dry source for a room (Apply room, or World Builder · Reverb in
 * Comfy), not a mix; nothing is recorded or downloaded.
 */
export const TAKE_SOUND_RATE = 48_000;
/**
 * Seconds into Death01 (`fall`) when the hips meet the floor, and then the
 * back: read off a captured Falling room take, frames 72 and 76 (24 fps).
 */
export const FALL_CONTACT_SECONDS = 1.0;
export const FALL_SETTLE_SECONDS = 0.17;

export interface Impact {
  at: number;
  /** Start and end of the pitch glide, Hz. */
  from: number;
  to: number;
  /** Decay time constant of the tone and of the noise burst, seconds. */
  tone: number;
  noise: number;
  gain: number;
}

/** Where the take's moves put a sound, in seconds from its first frame. */
export function takeImpacts(recipe: Recipe): Impact[] {
  if (!recipe.avatar || !Array.isArray(recipe.avatarMotion)) return [];
  const out: Impact[] = [];
  let start = 0;
  for (const step of recipe.avatarMotion) {
    // Each move starts on the nearest whole frame of the take.
    const at = Math.round(start * recipe.fps) / recipe.fps;
    if (step.clip === "hit")
      out.push({ at, from: 120, to: 75, tone: 0.06, noise: 0.012, gain: 0.5 });
    if (step.clip === "fall") {
      const land = at + Math.min(FALL_CONTACT_SECONDS, step.seconds);
      out.push(
        { at: land, from: 70, to: 42, tone: 0.14, noise: 0.03, gain: 0.85 },
        // The back and arms meet the floor just after the hips.
        {
          at: land + FALL_SETTLE_SECONDS,
          from: 85,
          to: 50,
          tone: 0.08,
          noise: 0.025,
          gain: 0.45,
        },
      );
    }
    start += step.seconds;
  }
  return out;
}

/** mulberry32: a small seeded generator, so the noise is the same every run. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The take's samples, mono, at 48 kHz, for the recipe's own length. */
export function takeSamples(recipe: Recipe, rate = TAKE_SOUND_RATE) {
  const length = Math.round((recipe.frames / recipe.fps) * rate);
  const out = new Float32Array(length);
  const noise = random(0x5eed);
  // Room tone: white noise through a one-pole low-pass, about -50 dBFS.
  let low = 0;
  for (let i = 0; i < length; i++) {
    low += 0.03 * (noise() * 2 - 1 - low);
    out[i] = low * 0.02;
  }
  for (const hit of takeImpacts(recipe)) {
    const first = Math.round(hit.at * rate);
    const span = Math.min(length - first, Math.round(hit.tone * 8 * rate));
    let phase = 0,
      burst = 0;
    for (let n = 0; n < span; n++) {
      const t = n / rate;
      const glide = hit.to + (hit.from - hit.to) * Math.exp(-t / 0.05);
      phase += (2 * Math.PI * glide) / rate;
      // A 2 ms attack keeps the onset from clicking.
      const attack = Math.min(1, t / 0.002);
      burst += 0.25 * (noise() * 2 - 1 - burst);
      out[first + n] +=
        attack *
        hit.gain *
        (Math.sin(phase) * Math.exp(-t / hit.tone) +
          0.6 * burst * Math.exp(-t / hit.noise));
    }
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const scale = peak > 0.89 ? 0.89 / peak : 1;
  const fade = Math.min(length, Math.round(0.02 * rate));
  for (let i = 0; i < length; i++)
    out[i] *= scale * Math.min(1, (length - 1 - i) / fade);
  return out;
}

/** The dry sound as a 16-bit PCM WAV the World Builder loads like any track. */
export function takeSoundWav(recipe: Recipe) {
  const channel = takeSamples(recipe);
  return audioWav(
    { channels: [channel], sampleRate: TAKE_SOUND_RATE, envelope: [] },
    recipe.frames / recipe.fps,
  );
}
