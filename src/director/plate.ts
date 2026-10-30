import { zlibSync } from "fflate";

// A template shot's stand-in until its clip exists: a small PNG fading from
// one house swatch to the next, scaled up by the renderer. Written here, not
// drawn on a canvas, so the same bytes come out in the browser and in tests.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
const rgb = (hex: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Bad colour ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
};

/** WCAG 2 contrast ratio between two `#rrggbb` colours, 1 to 21. */
export function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, b] = rgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** An RGB PNG of `width` × `height`, top colour fading to the bottom one. */
export function platePng(
  width: number,
  height: number,
  top: string,
  bottom: string,
): Uint8Array<ArrayBuffer> {
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 256))
    throw new Error("Plate size must be 1 to 256 pixels");
  const [a, b] = [rgb(top), rgb(bottom)];
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const t = height > 1 ? y / (height - 1) : 0;
    const row = y * (1 + width * 3); // filter byte 0: none
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 3; c++)
        raw[row + 1 + x * 3 + c] = Math.round(a[c] + (b[c] - a[c]) * t);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, deflate, no filter, no interlace
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlibSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}
