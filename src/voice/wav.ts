/**
 * The browser records with MediaRecorder (WebM/Opus in Chrome, MP4 in
 * Safari). Neither states a length the shared audio reader can measure, so
 * the studio decodes the recording and sends 16 kHz mono 16-bit WAV, which
 * `shared/audio.ts` measures exactly and the transcriber reads directly.
 */
export const VOICE_SAMPLE_RATE = 16_000;

/** Mono float samples to a 16-bit PCM WAV file. */
export function encodeWav(
  samples: Float32Array,
  rate = VOICE_SAMPLE_RATE,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const value = Math.max(
      -1,
      Math.min(1, Number.isFinite(sample) ? sample : 0),
    );
    view.setInt16(
      44 + i * 2,
      value < 0 ? value * 0x8000 : value * 0x7fff,
      true,
    );
  });
  return bytes;
}

/**
 * At most `maxSeconds` of samples. The stop timer can fire late on a busy
 * main thread; the server refuses anything past its limit, so a late stop
 * must lose the last moment, not the whole note.
 */
export function limitSamples(
  samples: Float32Array,
  rate: number,
  maxSeconds: number,
): Float32Array {
  const most = Math.floor(rate * maxSeconds);
  return samples.length > most ? samples.subarray(0, most) : samples;
}

/**
 * Decodes a recording at 16 kHz (the context resamples), averages it to
 * mono and keeps at most `maxSeconds`.
 */
export async function recordingToWav(
  blob: Blob,
  maxSeconds: number,
): Promise<Blob> {
  const context = new OfflineAudioContext(1, 1, VOICE_SAMPLE_RATE);
  const audio = await context.decodeAudioData(await blob.arrayBuffer());
  const mono = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const data = audio.getChannelData(channel);
    for (let i = 0; i < mono.length; i++)
      mono[i] += data[i] / audio.numberOfChannels;
  }
  const kept = limitSamples(mono, audio.sampleRate, maxSeconds);
  return new Blob([encodeWav(kept, audio.sampleRate)], { type: "audio/wav" });
}
