/**
 * An ICO file holding one PNG image: the 6-byte ICONDIR, one 16-byte
 * ICONDIRENTRY and the PNG bytes. `size` is the square image's edge in
 * pixels; 256 is written as 0, as the format requires.
 *
 * @param {Uint8Array} png
 * @param {number} size
 */
export function icoFromPng(png, size) {
  const edge = size >= 256 ? 0 : size;
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(edge, 6); // width
  header.writeUInt8(edge, 7); // height
  header.writeUInt8(0, 8); // no palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14); // image size
  header.writeUInt32LE(header.length, 18); // image offset
  return Buffer.concat([header, png]);
}
