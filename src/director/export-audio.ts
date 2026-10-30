import {
  AudioBufferSink,
  AudioBufferSource,
  BufferSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

export const aacConfig = {
  codec: "aac" as const,
  quality: new Quality({ bitrate: 192_000 }),
};
const rate = 48000;
const channels = 2;
const prefixSamples = 4096;
let calibration: Promise<number> | undefined;

async function encode(buffer: AudioBuffer, check: () => void) {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new AudioBufferSource(aacConfig);
  output.addAudioTrack(source);
  try {
    check();
    await output.start();
    await source.add(buffer);
    source.close();
    check();
    await output.finalize();
    if (!target.buffer) throw new Error("AAC encoder returned no output");
    return new Input({
      source: new BufferSource(target.buffer),
      formats: [MP4],
    });
  } catch (error) {
    await output.cancel();
    throw error;
  }
}

// WebCodecs does not expose AAC priming. Measure this encoder/decoder pair,
// rather than guessing a browser or OS constant. Two impulses prove a stable lag.
async function measureDelay() {
  const probe = new AudioBuffer({
    length: rate / 2,
    sampleRate: rate,
    numberOfChannels: channels,
  });
  const impulses = [4800, 14400];
  for (let c = 0; c < channels; c++)
    for (const index of impulses) probe.getChannelData(c)[index] = 0.75;
  const input = await encode(probe, () => {});
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("AAC calibration has no track");
    const decoded = new Float32Array(rate);
    for await (const { buffer, timestamp } of new AudioBufferSink(
      track,
    ).buffers()) {
      const start = Math.round(timestamp * rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++)
        if (start + i >= 0 && start + i < decoded.length)
          decoded[start + i] = data[i];
    }
    const lags = impulses.map((index) => {
      let peak = 0,
        at = index;
      for (let i = index - 512; i < index + 4096; i++) {
        if (Math.abs(decoded[i]) > peak) {
          peak = Math.abs(decoded[i]);
          at = i;
        }
      }
      if (peak < 0.1) throw new Error("AAC timing calibration failed");
      return at - index;
    });
    if (lags[0] !== lags[1] || lags[0] < 0 || lags[0] >= 4096)
      throw new Error("AAC encoder has inconsistent priming; export stopped");
    return lags[0];
  } finally {
    input.dispose();
  }
}

/** Supply AAC with priming removed by the MP4 edit list and an exact end time. */
export async function writeAudio(
  mix: AudioBuffer,
  destination: EncodedAudioPacketSource,
  check: () => void,
) {
  calibration ??= measureDelay().catch((error) => {
    calibration = undefined;
    throw error;
  });
  const delay = await calibration;
  check();
  // Guard against encoders that silence their first priming window.
  const padded = new AudioBuffer({
    length: mix.length + prefixSamples,
    sampleRate: rate,
    numberOfChannels: channels,
  });
  for (let c = 0; c < channels; c++)
    padded.getChannelData(c).set(mix.getChannelData(c), prefixSamples);
  const input = await encode(padded, check);
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("AAC output has no track");
    const config = await track.getDecoderConfig();
    if (!config) throw new Error("AAC output has no decoder configuration");
    const offset = (prefixSamples + delay) / rate;
    for await (const packet of new EncodedPacketSink(track).packets()) {
      check();
      const timestamp = Math.round((packet.timestamp - offset) * rate) / rate;
      if (timestamp >= mix.duration) break;
      await destination.add(
        packet.clone({
          timestamp,
          duration: Math.min(packet.duration, mix.duration - timestamp),
        }),
        { decoderConfig: config },
      );
    }
    destination.close();
  } finally {
    input.dispose();
  }
}
