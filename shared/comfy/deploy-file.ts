/** File signatures prevent arbitrary content being uploaded under a media type. */
export function validDeploymentFile(
  token: string,
  type: string,
  b: Uint8Array,
) {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...b.slice(start, end));
  if (token === "TAKE_WEBM" || token === "DEPTH_WEBM")
    return (
      type === "video/webm" &&
      b[0] === 0x1a &&
      b[1] === 0x45 &&
      b[2] === 0xdf &&
      b[3] === 0xa3
    );
  if (token === "TRACK_AUDIO")
    return (
      (type === "audio/wav" &&
        ascii(0, 4) === "RIFF" &&
        ascii(8, 12) === "WAVE") ||
      (type === "audio/flac" && ascii(0, 4) === "fLaC") ||
      (type === "audio/mpeg" &&
        (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)))
    );
  if (token !== "REFERENCE_PNG" && token !== "FIRST_FRAME_PNG") return false;
  return (
    (type === "image/png" && ascii(1, 4) === "PNG" && b[0] === 137) ||
    (type === "image/jpeg" &&
      b[0] === 0xff &&
      b[1] === 0xd8 &&
      b[2] === 0xff) ||
    (type === "image/webp" && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
  );
}
