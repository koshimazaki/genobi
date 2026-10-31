import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

/** Bounded regular-file reader. Paths never reach an HTTP body or error. */
export async function readLocalFile(value: unknown, limit: number) {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    !path.isAbsolute(value) ||
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new Error("Supply an absolute path to a regular media file.");
  let handle;
  try {
    const target = await realpath(value);
    if (!(await lstat(target)).isFile()) throw new Error();
    handle = await open(
      target,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > limit)
      throw new Error();
    const bytes = new Uint8Array(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!bytesRead) throw new Error();
      offset += bytesRead;
    }
    if ((await handle.stat()).size !== stat.size) throw new Error();
    return bytes;
  } catch {
    throw new Error(
      `Could not read a regular media file within the ${limit}-byte limit.`,
    );
  } finally {
    await handle?.close();
  }
}
