import { inspectMp4 } from "./mp4";
import { inspectImage } from "./image";
import { MISMATCH_MESSAGE, type UploadType } from "./uploads";

import {
  ARENA_MAX_BYTES,
  ARENA_MAX_SECONDS,
  ARENA_MAX_SIDE,
  ARENA_MAX_PIXELS,
  ARENA_UPLOAD_MESSAGE,
} from "./arena-limits";
export { ARENA_MAX_BYTES } from "./arena-limits";

/** Arena evidence is independent of the paid upscale input contract. */
export async function inspectArenaUpload(
  type: UploadType,
  size: number,
  read: (offset: number, length: number) => Promise<ArrayBuffer>,
) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > ARENA_MAX_BYTES)
    throw new Error(ARENA_UPLOAD_MESSAGE);
  if (type.kind === "video") {
    const found = await inspectMp4(size, read);
    if (
      found.duration > ARENA_MAX_SECONDS ||
      Math.max(found.width, found.height) > ARENA_MAX_SIDE ||
      found.width * found.height > ARENA_MAX_PIXELS
    )
      throw new Error(ARENA_UPLOAD_MESSAGE);
    return found;
  }
  if (type.kind !== "image") throw new Error(ARENA_UPLOAD_MESSAGE);
  const found = inspectImage(new Uint8Array(await read(0, size)));
  if (found.contentType !== type.contentType) throw new Error(MISMATCH_MESSAGE);
  return found;
}
