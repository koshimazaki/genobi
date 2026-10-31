import { audioWav, type AudioTrack } from "./audio";
import {
  validateAcousticSchedule,
  type AcousticSchedule,
} from "./acoustic-schedule";
import {
  buildRoomImpulse,
  roomImpulseKey,
  ROOM_AUDIO_ENGINE,
  type RoomImpulse,
} from "./scene-room-ir";

export type RoomTailPolicy = "extend" | "trim-fade";
/** Finite safety bound, not peak normalisation: ordinary unclipped float PCM is valid. */
export const MAX_ROOM_PCM_AMPLITUDE = 1_000_000;
export interface DynamicRoomOptions {
  wet?: number;
  dry?: number;
  tail?: RoomTailPolicy;
  signal?: AbortSignal;
  /** Completed unique IR renders / total unique IR renders. */
  onProgress?: (completed: number, total: number) => void;
}
export interface DynamicRoomResult {
  track: AudioTrack;
  wav: Blob;
  schedule: AcousticSchedule;
  engine: typeof ROOM_AUDIO_ENGINE;
  wet: number;
  dry: number;
  tail: RoomTailPolicy;
  tailSeconds: number;
  trimFadeSeconds: number;
  /** One gain applied to the entire mix if its peak would exceed 0.98. */
  peakGain: number;
  irs: { key: string; rt60: number; seconds: number; truncated: boolean }[];
}
export type RoomConvolver = (
  channels: readonly Float32Array[],
  impulse: Float32Array,
  sampleRate: number,
  length: number,
  signal?: AbortSignal,
) => Promise<Float32Array[]>;

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Room render cancelled.", "AbortError");
}

/**
 * Each convolver hears the COMPLETE dry source from time zero. We do not
 * replace an impulse on a running ConvolverNode and lose its input history.
 * Mono IRs process stereo channels independently; there is no stereo widening.
 */
export const browserRoomConvolver: RoomConvolver = async (
  channels,
  impulse,
  sampleRate,
  length,
  signal,
) => {
  checkAbort(signal);
  if (typeof OfflineAudioContext === "undefined")
    throw new Error(
      "Offline Web Audio is needed to render this room in the browser.",
    );
  const context = new OfflineAudioContext(channels.length, length, sampleRate);
  const buffer = context.createBuffer(
    channels.length,
    // Keep the source's channel count alive with silence through the tail.
    // Chromium otherwise collapses a stopped stereo source to one channel
    // while ConvolverNode is still draining its history.
    Math.max(length, channels[0].length),
    sampleRate,
  );
  channels.forEach((data, channel) => buffer.getChannelData(channel).set(data));
  const response = context.createBuffer(1, impulse.length, sampleRate);
  response.getChannelData(0).set(impulse);
  const source = context.createBufferSource();
  const convolver = context.createConvolver();
  convolver.normalize = false;
  convolver.buffer = response;
  source.buffer = buffer;
  source.connect(convolver).connect(context.destination);
  source.start(0);
  try {
    const output = await context.startRendering();
    checkAbort(signal);
    return channels.map((_, channel) => output.getChannelData(channel).slice());
  } finally {
    source.disconnect();
    convolver.disconnect();
    source.buffer = null;
    convolver.buffer = null;
  }
};

function drySamples(input: AudioTrack, duration: number) {
  if (
    !input ||
    !Number.isInteger(input.sampleRate) ||
    input.sampleRate < 8000 ||
    input.sampleRate > 96000 ||
    !Array.isArray(input.channels) ||
    input.channels.length < 1 ||
    input.channels.length > 2 ||
    input.channels.some((c) => !(c instanceof Float32Array))
  )
    throw new Error("Use mono or stereo PCM at 8–96 kHz for room sound.");
  const length = Math.round(duration * input.sampleRate);
  return input.channels.map((channel) => {
    const out = new Float32Array(length);
    out.set(channel.subarray(0, length));
    if (
      out.some(
        (v) => !Number.isFinite(v) || Math.abs(v) > MAX_ROOM_PCM_AMPLITUDE,
      )
    )
      throw new Error(
        "Dry audio contains invalid samples or exceeds the PCM safety limit.",
      );
    return out;
  });
}

/**
 * Linear interpolation of full wet signals, indexed by the picture clock.
 * A steady/static IR sums exactly to that IR even when several schedule knots
 * share it. After the final picture frame the final IR stays active for tails.
 */
function addWet(
  output: Float32Array[],
  wet: Float32Array[],
  schedule: AcousticSchedule,
  keys: readonly string[],
  key: string,
  sampleRate: number,
  gain: number,
) {
  if (
    wet.length !== output.length ||
    wet.some((c) => c.length !== output[0].length)
  )
    throw new Error("Convolution returned an incompatible audio buffer.");
  const knots = schedule.snapshots;
  let right = 1;
  for (let sample = 0; sample < output[0].length; sample++) {
    const frame = (sample * schedule.fps) / sampleRate;
    while (right < knots.length && frame >= knots[right].frame) right++;
    let weight = 0;
    if (right >= knots.length) weight = keys[keys.length - 1] === key ? 1 : 0;
    else {
      const left = right - 1;
      const mix =
        (frame - knots[left].frame) / (knots[right].frame - knots[left].frame);
      if (keys[left] === key) weight += 1 - mix;
      if (keys[right] === key) weight += mix;
    }
    if (!weight) continue;
    for (let channel = 0; channel < output.length; channel++) {
      const value = wet[channel][sample];
      if (!Number.isFinite(value))
        throw new Error("Convolution returned invalid audio.");
      output[channel][sample] += value * weight * gain;
      if (!Number.isFinite(output[channel][sample]))
        throw new Error("Room audio mix exceeded its finite safety limit.");
    }
  }
}

/**
 * Runs locally without an upload or model. `dryInput` is explicitly the sound
 * emitted inside the room, NOT the control track or an independent soundtrack.
 * Only schedule geometry uses the frozen control envelopes; wet PCM is never
 * analysed back into scene motion. An injected convolver supports exact CPU
 * fixtures; the default is the browser's offline CPU convolution engine.
 */
export async function renderDynamicRoomAudio(
  dryInput: AudioTrack,
  inputSchedule: AcousticSchedule,
  options: DynamicRoomOptions = {},
  convolve: RoomConvolver = browserRoomConvolver,
): Promise<DynamicRoomResult> {
  checkAbort(options.signal);
  const schedule = structuredClone(validateAcousticSchedule(inputSchedule));
  const wet = options.wet ?? 0.35,
    dry = options.dry ?? 1;
  const tail = options.tail ?? "extend";
  if (
    ![wet, dry].every((v) => Number.isFinite(v) && v >= 0 && v <= 2) ||
    !["extend", "trim-fade"].includes(tail)
  )
    throw new Error(
      "Room wet/dry gains must be 0–2 with an explicit tail policy.",
    );
  const source = drySamples(dryInput, schedule.duration);
  const sampleRate = dryInput.sampleRate;
  const cache = new Map<string, RoomImpulse>();
  const keys: string[] = [];
  for (const { room } of schedule.snapshots) {
    checkAbort(options.signal);
    const key = roomImpulseKey(room, sampleRate, schedule.maxIRSeconds);
    keys.push(key);
    if (!cache.has(key))
      cache.set(key, buildRoomImpulse(room, sampleRate, schedule.maxIRSeconds));
  }
  const finalImpulse = cache.get(keys[keys.length - 1])!;
  const sourceLength = source[0].length;
  const length =
    sourceLength + (tail === "extend" ? finalImpulse.samples.length - 1 : 0);
  const output = source.map((channel) => {
    const out = new Float32Array(length);
    for (let i = 0; i < sourceLength; i++) out[i] = channel[i] * dry;
    return out;
  });
  options.onProgress?.(0, cache.size);
  let completed = 0;
  if (wet > 0)
    for (const [key, response] of cache) {
      checkAbort(options.signal);
      const signal = await convolve(
        source,
        response.samples,
        sampleRate,
        length,
        options.signal,
      );
      checkAbort(options.signal);
      addWet(output, signal, schedule, keys, key, sampleRate, wet);
      options.onProgress?.(++completed, cache.size);
      // Yield between IRs: cancellation and editor input stay responsive.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  else options.onProgress?.(cache.size, cache.size);
  checkAbort(options.signal);
  const fade =
    tail === "trim-fade" ? Math.min(length, Math.round(0.05 * sampleRate)) : 0;
  let peak = 0;
  for (const channel of output)
    for (let i = 0; i < length; i++) {
      if (fade) channel[i] *= Math.min(1, (length - 1 - i) / fade);
      if (!Number.isFinite(channel[i]))
        throw new Error("Room audio mix contains non-finite samples.");
      peak = Math.max(peak, Math.abs(channel[i]));
    }
  const peakGain = peak > 0.98 ? 0.98 / peak : 1;
  if (peakGain !== 1)
    for (const channel of output)
      for (let i = 0; i < length; i++) channel[i] *= peakGain;
  const track: AudioTrack = { channels: output, sampleRate, envelope: [] };
  return {
    track,
    wav: audioWav(track, length / sampleRate),
    schedule,
    engine: ROOM_AUDIO_ENGINE,
    wet,
    dry,
    tail,
    peakGain,
    tailSeconds: (length - sourceLength) / sampleRate,
    trimFadeSeconds: fade / sampleRate,
    irs: [...cache].map(([key, response]) => ({
      key,
      rt60: response.rt60,
      seconds: response.seconds,
      truncated: response.truncated,
    })),
  };
}
