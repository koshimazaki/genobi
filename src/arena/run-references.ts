import { arenaMediaUrl, type Arena } from "../../shared/arena";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_REFERENCES,
  MAX_IMAGE_REQUEST_BYTES,
} from "../../shared/image";

const encode = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("A reference could not be read."));
    reader.readAsDataURL(blob);
  });

/** The still references a run would send: images not used as a result. */
export function referenceImages(arena: Arena) {
  const used = new Set(arena.slots.map((s) => s.media));
  return arena.media.filter((m) => m.kind === "image" && !used.has(m.hash));
}

/**
 * Why this reference set cannot be sent, or undefined when it can. The
 * generator shows it beside the drop zone; a run refuses on it before quoting.
 */
export function referenceProblem(arena: Arena) {
  const images = referenceImages(arena);
  if (images.length > MAX_IMAGE_REFERENCES)
    return `Image runs accept at most ${MAX_IMAGE_REFERENCES} references. Remove extra references before running.`;
  const oversized = images.find((m) => m.bytes > MAX_IMAGE_BYTES);
  if (oversized)
    return `Reference “${oversized.label}” exceeds 5 MiB. Use a smaller image before running; no references were omitted.`;
  if (images.reduce((n, m) => n + m.bytes, 0) > MAX_IMAGE_REQUEST_BYTES * 0.7)
    return "The image references exceed the combined request limit. Use smaller or fewer references before running.";
}

/** Refuse an incomplete reference set before quoting or submitting a run. */
export async function referenceUrls(
  arena: Arena,
  fetcher = fetch,
  encodeBlob = encode,
) {
  const problem = referenceProblem(arena);
  if (problem) throw new Error(problem);
  const images = referenceImages(arena);
  return Promise.all(
    images.map(async (media) => {
      const response = await fetcher(arenaMediaUrl(arena.id, media.hash), {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          `Reference “${media.label}” could not be loaded. Try again before running.`,
        );
      const blob = await response.blob();
      if (blob.size !== media.bytes)
        throw new Error(
          `Reference “${media.label}” is incomplete. Reload it before running.`,
        );
      return encodeBlob(blob);
    }),
  );
}
