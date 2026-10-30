/** Small single-track VP8 WebM writer. No audio, streaming or arbitrary codecs.
 * One cluster per frame keeps block timecodes bounded at microsecond precision.
 * Container reference: https://www.webmproject.org/docs/container/
 */
type Bytes = Uint8Array<ArrayBuffer>;
const concat = (...parts: Bytes[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
function uint(value: number): Bytes {
  const out: number[] = [];
  do {
    out.unshift(value % 256);
    value = Math.floor(value / 256);
  } while (value);
  return new Uint8Array(out);
}
function size(value: number): Bytes {
  let length = 1;
  while (value >= 2 ** (7 * length) - 1) length++;
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    out[i] = value % 256;
    value = Math.floor(value / 256);
  }
  out[0] |= 1 << (8 - length);
  return out;
}
const el = (id: number, data: Bytes): Bytes =>
  concat(uint(id), size(data.length), data);
const num = (id: number, value: number): Bytes => el(id, uint(value));
const str = (id: number, value: string): Bytes =>
  el(id, new TextEncoder().encode(value));
function float(id: number, value: number): Bytes {
  const data = new Uint8Array(8);
  new DataView(data.buffer).setFloat64(0, value);
  return el(id, data);
}
export interface EncodedFrame {
  timestamp: number;
  key: boolean;
  data: Bytes;
}
export function makeWebm(
  frames: EncodedFrame[],
  width: number,
  height: number,
  fps: number,
): Blob {
  const header = el(
    0x1a45dfa3,
    concat(
      num(0x4286, 1),
      num(0x42f7, 1),
      num(0x42f2, 4),
      num(0x42f3, 8),
      str(0x4282, "webm"),
      num(0x4287, 2),
      num(0x4285, 2),
    ),
  );
  const info = el(
    0x1549a966,
    concat(
      num(0x2ad7b1, 1000),
      str(0x4d80, "Director World Builder"),
      str(0x5741, "Director World Builder"),
      float(0x4489, (frames.length / fps) * 1e6),
    ),
  );
  const tracks = el(
    0x1654ae6b,
    el(
      0xae,
      concat(
        num(0xd7, 1),
        num(0x73c5, 1),
        num(0x83, 1),
        str(0x86, "V_VP8"),
        num(0x23e383, Math.round(1e9 / fps)),
        el(0xe0, concat(num(0xb0, width), num(0xba, height))),
      ),
    ),
  );
  const clusters = frames.map((frame) =>
    el(
      0x1f43b675,
      concat(
        num(0xe7, frame.timestamp),
        el(
          0xa3,
          concat(
            new Uint8Array([0x81, 0, 0, frame.key ? 0x80 : 0]),
            frame.data,
          ),
        ),
      ),
    ),
  );
  return new Blob([header, el(0x18538067, concat(info, tracks, ...clusters))], {
    type: "video/webm",
  });
}
