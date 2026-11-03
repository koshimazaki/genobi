import type { Recipe } from "./recipe";
import { audioWav, type AudioTrack } from "./audio";
import { hash } from "./export-take";
import { sceneCaptureInfo } from "./scene-capture";
import type { DynamicRoomResult } from "./dynamic-room-audio";

export interface RoomSoundSource {
  label: string;
  origin: "file" | "test-impulses" | "control-copy";
  blob: Blob;
  sha256: string;
  track: AudioTrack;
}

/** Hash the exact padded/trimmed floating-point PCM used by the CPU renderer. */
export async function roomSourcePcmHash(track: AudioTrack, duration: number) {
  const frames = Math.round(duration * track.sampleRate);
  const bytes = new ArrayBuffer(12 + frames * track.channels.length * 4);
  const view = new DataView(bytes);
  view.setUint32(0, track.sampleRate, true);
  view.setUint32(4, track.channels.length, true);
  view.setUint32(8, frames, true);
  for (let sample = 0; sample < frames; sample++)
    for (let channel = 0; channel < track.channels.length; channel++)
      view.setFloat32(
        12 + (sample * track.channels.length + channel) * 4,
        track.channels[channel][sample] ?? 0,
        true,
      );
  return hash(new Blob([bytes]));
}

export async function roomSoundReceipt(
  recipe: Recipe,
  source: RoomSoundSource,
  rendered: DynamicRoomResult,
) {
  const duration = recipe.frames / recipe.fps;
  const [sceneEvaluation, sourcePcmSha256, outputSha256] = await Promise.all([
    sceneCaptureInfo(recipe),
    roomSourcePcmHash(source.track, duration),
    hash(rendered.wav),
  ]);
  return {
    format: "genobi-room-sound",
    version: 1,
    engine: rendered.engine,
    roles: {
      controlAudio: "frozen-recipe-envelopes",
      emittedSound: "independent-dry-source",
      soundtrack: "independent-editor-track",
      wetOutputDrivesMotion: false,
    },
    recipe: structuredClone(recipe),
    sceneEvaluation,
    source: {
      label: source.label,
      origin: source.origin,
      sha256: source.sha256,
      pcmSha256: sourcePcmSha256,
      pcmHashEncoding: "u32le rate,channels,frames + interleaved f32le",
      bytes: source.blob.size,
      mediaType: source.blob.type,
      sampleRate: source.track.sampleRate,
      channels: source.track.channels.length,
      inputFrames: source.track.channels[0].length,
      startSeconds: 0,
      sceneSeconds: duration,
      fittedFrames: Math.round(duration * source.track.sampleRate),
      fit: "trim-or-silence-pad-to-picture",
    },
    schedule: structuredClone(rendered.schedule),
    mix: {
      wet: rendered.wet,
      dry: rendered.dry,
      peakGain: rendered.peakGain,
      tailPolicy: rendered.tail,
      tailSeconds: rendered.tailSeconds,
      trimFadeSeconds: rendered.trimFadeSeconds,
    },
    impulseResponses: structuredClone(rendered.irs),
    output: {
      filename: "room-sound.wav",
      sha256: outputSha256,
      bytes: rendered.wav.size,
      sampleRate: rendered.track.sampleRate,
      channels: rendered.track.channels.length,
      frames: rendered.track.channels[0].length,
      seconds: rendered.track.channels[0].length / rendered.track.sampleRate,
      encoding: "pcm-s16le-wav",
    },
  };
}
export type RoomSoundReceipt = Awaited<ReturnType<typeof roomSoundReceipt>>;

/** Repeatable dry probes, including one just before the picture boundary. */
export function roomTestImpulses(recipe: Pick<Recipe, "frames" | "fps">) {
  const sampleRate = 48000,
    duration = recipe.frames / recipe.fps;
  const channel = new Float32Array(Math.round(duration * sampleRate));
  const starts = [Math.min(0.2, duration / 4)];
  for (let t = 1.5; t < duration - 0.3; t += 1.5) starts.push(t);
  starts.push(Math.max(0, duration - 0.025));
  for (const time of starts) {
    const first = Math.round(time * sampleRate);
    for (let n = 0; n < Math.min(960, channel.length - first); n++) {
      const t = n / sampleRate;
      channel[first + n] +=
        0.35 *
        Math.sin(2 * Math.PI * 650 * t) *
        Math.exp(-t / 0.004) *
        Math.min(1, n / 20);
    }
  }
  const track: AudioTrack = { channels: [channel], sampleRate, envelope: [] };
  return { track, blob: audioWav(track, duration) };
}
