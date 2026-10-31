import { AppError } from "../server/errors";
import { MAX_IMAGE_RESULT_BYTES } from "../shared/image";

/** Images are small enough to buffer only after enforcing the same bounded byte ceiling. */
export async function readImageResponse(response: Response) {
  if (
    Number(response.headers.get("content-length")) > MAX_IMAGE_RESULT_BYTES ||
    !response.body
  )
    throw new AppError(502, "The generated image is too large.");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > MAX_IMAGE_RESULT_BYTES)
        throw new AppError(502, "The generated image is too large.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
