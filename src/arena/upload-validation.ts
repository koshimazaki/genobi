import { ARENA_MAX_BYTES } from "../../shared/arena-limits";

const TYPES = ["video/mp4", "image/png", "image/jpeg", "image/webp"];

/** Results and references alike: an MP4 or a still, measured again by the server. */
export function validateArenaFile(file: Pick<File, "size" | "type">) {
  if (!TYPES.includes(file.type))
    throw new Error("Use an MP4 video or a PNG, JPEG or WebP image.");
  if (file.size > ARENA_MAX_BYTES) throw new Error("Use a file up to 64 MiB.");
}
