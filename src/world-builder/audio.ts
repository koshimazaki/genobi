import { analyseSubBand, type BandEnvelopes } from "./audio-bands";
import { compactAudioEnvelope } from "./audio-envelope";
import { TAKE_FPS, TAKE_FRAMES } from "./take-duration";

/** Fixed-grid analysis reuses Holodeck's frame-indexed, imperative modulation approach. */
export function rmsEnvelope(
  channels: Float32Array[],
  sampleRate: number,
  fps = 24,
) {
  const length = Math.min(
    TAKE_FRAMES.max,
    Math.ceil((channels[0].length / sampleRate) * fps),
  );
  return compactAudioEnvelope(
    Array.from({ length }, (_, frame) => {
      const start = Math.floor((frame * sampleRate) / fps),
        end = Math.min(
          channels[0].length,
          Math.floor(((frame + 1) * sampleRate) / fps),
        );
      let sum = 0;
      for (const channel of channels)
        for (let i = start; i < end; i++) sum += channel[i] * channel[i];
      return Math.min(
        1,
        Math.sqrt(sum / Math.max(1, (end - start) * channels.length)),
      );
    }),
  );
}
export async function decodeAudio(file: Blob) {
  if (file.size > 32 * 1024 * 1024) throw new Error("Audio limit: 32 MB.");
  const context = new AudioContext({ sampleRate: 48000 });
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration > 600)
      throw new Error("Use audio shorter than 10 minutes.");
    const channels = Array.from(
      { length: Math.min(2, buffer.numberOfChannels) },
      (_, i) => buffer.getChannelData(i).slice(),
    );
    return {
      channels,
      sampleRate: buffer.sampleRate,
      envelope: rmsEnvelope(channels, buffer.sampleRate),
      bands: analyseBands(channels, buffer.sampleRate),
    };
  } finally {
    await context.close();
  }
}
export interface AudioTrack {
  channels: Float32Array[];
  sampleRate: number;
  envelope: number[];
  bands?: BandEnvelopes;
}
/** Frame-aligned PCM companion for Comfy audio/video combine. Silence pads short inputs. */
export function audioWav(track: AudioTrack, duration: number) {
  const frames = Math.round(duration * track.sampleRate),
    count = track.channels.length;
  const bytes = new ArrayBuffer(44 + frames * count * 2),
    view = new DataView(bytes);
  const str = (at: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, track.sampleRate, true);
  view.setUint32(28, track.sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, frames * count * 2, true);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < count; c++) {
      const n = Math.max(-1, Math.min(1, track.channels[c][i] ?? 0));
      view.setInt16(
        44 + (i * count + c) * 2,
        Math.round(n * (n < 0 ? 32768 : 32767)),
        true,
      );
    }
  return new Blob([bytes], { type: "audio/wav" });
}

/** Bounded offline crossover analysis, sampled on the same capture frame grid. */
export function analyseBands(channels: Float32Array[], sampleRate: number) {
  const n = Math.min(
    channels[0].length,
    Math.ceil((TAKE_FRAMES.max / TAKE_FPS) * sampleRate),
  );
  const lows: Float32Array[] = [],
    mids: Float32Array[] = [],
    highs: Float32Array[] = [];
  const a = 1 - Math.exp((-2 * Math.PI * 200) / sampleRate),
    b = 1 - Math.exp((-2 * Math.PI * 2000) / sampleRate);
  for (const channel of channels) {
    const lowBand = new Float32Array(n),
      midBand = new Float32Array(n),
      highBand = new Float32Array(n);
    let low = 0,
      upper = 0;
    for (let i = 0; i < n; i++) {
      const x = channel[i] ?? 0;
      low += a * (x - low);
      upper += b * (x - upper);
      lowBand[i] = low;
      midBand[i] = upper - low;
      highBand[i] = x - upper;
    }
    lows.push(lowBand);
    mids.push(midBand);
    highs.push(highBand);
  }
  return {
    sub: analyseSubBand(channels, sampleRate),
    low: rmsEnvelope(lows, sampleRate),
    mid: rmsEnvelope(mids, sampleRate),
    high: rmsEnvelope(highs, sampleRate),
  };
}
