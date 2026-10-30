/** Decode locally: CSP connect-src intentionally does not allow fetching data URLs. */
export function referenceBytes(url: string) {
  if (url.length > 7 * 1024 * 1024) throw new Error("Reference exceeds 5 MB");
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(url);
  if (!match || !match[2] || match[2].length % 4)
    throw new Error("Invalid reference image data");
  const binary = atob(match[2]);
  if (binary.length > 5 * 1024 * 1024)
    throw new Error("Reference exceeds 5 MB");
  return {
    type: match[1],
    bytes: Uint8Array.from(binary, (c) => c.charCodeAt(0)),
  };
}
