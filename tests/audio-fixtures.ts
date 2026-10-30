/** Minimal, valid-enough audio headers for the bounded readers. */
/** 16-bit mono; `format` sets the WAVE format tag (1 is PCM, 0x11 IMA ADPCM). */
export function wav(seconds: number, rate = 8000, format = 1) {
  const data = seconds * rate * 2;
  const bytes = new Uint8Array(44 + data);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, data, true);
  return bytes;
}

export function flac(samples: number, rate = 44100) {
  const bytes = new Uint8Array(42 + 64);
  bytes.set([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34], 0);
  bytes[18] = (rate >> 12) & 0xff;
  bytes[19] = (rate >> 4) & 0xff;
  // Low rate bits, two channels, 16 bits per sample, top sample bits zero.
  bytes[20] = ((rate & 0x0f) << 4) | (1 << 1) | 0;
  bytes[21] = 15 << 4;
  new DataView(bytes.buffer).setUint32(22, samples);
  return bytes;
}

/**
 * MPEG-1 Layer III, 44.1 kHz, stereo, a frame header every frame across the
 * file: 128 kbps throughout, or alternating with 192 kbps when `vbr` is set.
 * The first frame carries a Xing frame count when `frames` is set.
 */
export function mp3(totalBytes: number, frames?: number, id3 = 0, vbr = false) {
  const bytes = new Uint8Array(totalBytes);
  let at = 0;
  if (id3) {
    bytes.set([0x49, 0x44, 0x33, 4, 0, 0], 0);
    bytes.set(
      [(id3 >> 21) & 0x7f, (id3 >> 14) & 0x7f, (id3 >> 7) & 0x7f, id3 & 0x7f],
      6,
    );
    at = 10 + id3;
  }
  const first = at;
  // 144 × 128,000 / 44,100 and 144 × 192,000 / 44,100 bytes, unpadded.
  for (let n = 0; at + 4 <= totalBytes; n++) {
    const wide = vbr && n % 2 === 1;
    bytes.set([0xff, 0xfb, wide ? 0xb0 : 0x90, 0x00], at);
    at += wide ? 626 : 417;
  }
  if (frames !== undefined) {
    const xing = first + 4 + 32;
    bytes.set([0x58, 0x69, 0x6e, 0x67, 0, 0, 0, 1], xing);
    new DataView(bytes.buffer).setUint32(xing + 8, frames);
  }
  return bytes;
}
