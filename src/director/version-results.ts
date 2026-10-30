import {
  ASSET_MEDIA_TYPES,
  assetContentType,
} from "../../shared/director/asset-media";
import { DIRECTOR_MEDIA_BYTES } from "../../shared/director/types";

/** Owner-checked result URL, bounded even when Content-Length is absent. */
export async function versionMediaFile(
  url: string,
  name: string,
  kinds = ["image", "video"],
  limit = DIRECTOR_MEDIA_BYTES,
): Promise<File> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const type = assetContentType(response.headers.get("Content-Type"));
  if (
    !response.ok ||
    !response.body ||
    !type ||
    !kinds.includes(ASSET_MEDIA_TYPES[type].kind)
  ) {
    await response.body?.cancel();
    throw new Error("The result is not an available image or video.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get("Content-Length")) > limit)
      throw new Error("The file exceeds the media limit.");
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("The file exceeds the media limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return new File(chunks, `${name}.${ASSET_MEDIA_TYPES[type].extension}`, {
    type,
  });
}
