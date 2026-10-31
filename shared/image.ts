import type { GenerateInput, Generator, VideoModel } from "./types";

/** Maximum caption accepted by both local and hosted image validators. */
export const IMAGE_DESCRIPTION_LIMIT = 12_000;

/** BFL's documented `aspect_ratio` values for FLUX 3 Image and Klein, `auto` first. */
export const IMAGE_ASPECT_RATIOS = [
  "auto",
  "21:9",
  "2:1",
  "16:9",
  "3:2",
  "7:5",
  "4:3",
  "5:4",
  "1:1",
  "4:5",
  "3:4",
  "5:7",
  "2:3",
  "9:16",
  "1:2",
  "9:21",
] as const;
/** The FLUX 3 Image tiers the studio prices; BFL also lists 1.5k, unpriced here. */
export const IMAGE_RESOLUTIONS = ["768sq", "1k", "2k", "4k"] as const;
/**
 * FLUX 3 Image Klein's tiers, as `POST /v1/flux-3-image-klein` lists them
 * (docs.bfl.ai, checked 21 October 2026), each with a price.
 */
export const KLEIN_RESOLUTIONS = ["768sq", "1k", "1.5k", "2k", "4k"] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];
export type ImageResolution = (typeof KLEIN_RESOLUTIONS)[number];
type FluxImageResolution = (typeof IMAGE_RESOLUTIONS)[number];
export const IMAGE_PRICE_USD: Record<FluxImageResolution, number> = {
  "768sq": 0.041,
  "1k": 0.048,
  "2k": 0.1,
  "4k": 0.607,
};
/**
 * BFL's per-image Klein prices (docs.bfl.ai/quick_start/pricing, 21 October
 * 2026), text to image and edits alike. The open graph is billed by Comfy
 * Cloud GPU time, or nothing on a local ComfyUI; until the phase 4 cost
 * formula it is estimated at these rates, as Acoustic Space is at Fast's.
 */
export const KLEIN_PRICE_USD: Record<ImageResolution, number> = {
  "768sq": 0.008,
  "1k": 0.009,
  "1.5k": 0.011,
  "2k": 0.014,
  "4k": 0.036,
};
// A deliberately smaller prototype ceiling than the provider's 20MB per image.
export const MAX_IMAGE_RESULT_BYTES = 32 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_REQUEST_BYTES = 16 * 1024 * 1024;
export const MAX_IMAGE_REFERENCES = 10;
/** The largest image either adapter reads back: BFL's 4K bin, 4096². */
export const MAX_IMAGE_PIXELS = 16_777_216;
export const isImage = (generator: Generator) =>
  generator === "image" || generator === "edit";
/** Either way of running FLUX 3 Image Klein. */
export const isKlein = (model: VideoModel | undefined) =>
  model === "flux-3-klein" || model === "flux-3-klein-api";
/** A Klein image with references edits its first image, without a prior generation. */
export const imageEditing = (
  input: Pick<GenerateInput, "generator" | "model" | "imageReferences">,
) =>
  input.generator === "edit" ||
  (isKlein(input.model) && Boolean(input.imageReferences?.length));
export const estimateImageUsd = (
  input: Pick<GenerateInput, "model" | "imageResolution">,
) => {
  const tier = input.imageResolution ?? "1k";
  return isKlein(input.model)
    ? KLEIN_PRICE_USD[tier]
    : (IMAGE_PRICE_USD[tier as FluxImageResolution] ?? IMAGE_PRICE_USD["1k"]);
};
/**
 * The body for BFL's image endpoints. FLUX 3 Image takes `grounding`; Klein's
 * schema has no such field and refuses unknown ones (`additionalProperties:
 * false`), so a Klein body never carries it.
 */
export function imageBody(input: GenerateInput, prompt = input.description) {
  return {
    prompt,
    ...(input.imageReferences?.length
      ? {
          images: input.imageReferences.map((ref) =>
            ref.slice(ref.indexOf(",") + 1),
          ),
        }
      : {}),
    aspect_ratio: input.imageAspectRatio ?? "auto",
    resolution: input.imageResolution ?? "1k",
    ...(isKlein(input.model)
      ? {}
      : { grounding: input.imageGrounding ?? false }),
    safety_tolerance: input.imageSafetyTolerance ?? 2,
  };
}

/** Bounded header inspection, shared by local and hosted adapters. No SVG or external URL inputs. */
export function inspectImage(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0,
    contentType = "";
  if (
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
    view.getUint32(12) === 0x49484452
  ) {
    width = view.getUint32(16);
    height = view.getUint32(20);
    contentType = "image/png";
  } else if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p++] !== 255) break;
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (p + 2 > bytes.length) break;
      const length = view.getUint16(p);
      if (length < 2 || p + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      ) {
        height = view.getUint16(p + 3);
        width = view.getUint16(p + 5);
        contentType = "image/jpeg";
        break;
      }
      p += length;
    }
  } else if (
    bytes.length >= 30 &&
    view.getUint32(0) === 0x52494646 &&
    view.getUint32(8) === 0x57454250
  ) {
    const tag = view.getUint32(12);
    if (tag === 0x56503858) {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    }
    if (
      tag === 0x56503820 &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    ) {
      width = view.getUint16(26, true) & 16383;
      height = view.getUint16(28, true) & 16383;
    }
    if (tag === 0x5650384c && bytes[20] === 47) {
      const n = view.getUint32(21, true);
      width = (n & 16383) + 1;
      height = ((n >>> 14) & 16383) + 1;
    }
    contentType = "image/webp";
  }
  if (!width || !height || width * height > MAX_IMAGE_PIXELS)
    throw new Error("Use a PNG, JPEG, or WebP image up to 16 megapixels.");
  return { width, height, duration: 0, contentType };
}
const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function imageReference(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 40
  )
    throw new Error("Each reference must be an image under 5 MB.");
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value,
    );
  if (!match || match[2].length % 4)
    throw new Error("Upload a PNG, JPEG, or WebP reference image.");
  const raw = match[2],
    padding = raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((raw.length / 4) * 3 - padding);
  let p = 0;
  for (let i = 0; i < raw.length; i += 4) {
    const n =
      (alphabet.indexOf(raw[i]) << 18) |
      (alphabet.indexOf(raw[i + 1]) << 12) |
      (Math.max(0, alphabet.indexOf(raw[i + 2])) << 6) |
      Math.max(0, alphabet.indexOf(raw[i + 3]));
    if (p < bytes.length) bytes[p++] = n >>> 16;
    if (p < bytes.length) bytes[p++] = n >>> 8;
    if (p < bytes.length) bytes[p++] = n;
  }
  const metadata = inspectImage(bytes);
  if (
    metadata.contentType !== match[1] ||
    metadata.width < 256 ||
    metadata.height < 256
  )
    throw new Error(
      "References must match their image type and be at least 256 × 256 pixels.",
    );
  return { bytes, metadata };
}
