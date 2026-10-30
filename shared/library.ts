import { checkUpscaleLimits } from "./mp4";
import { readLtxPrompt } from "./ltx-prompt";
import { registry } from "./registry";
import type { LibrarySetup, Source, VideoModel } from "./types";

/**
 * The bundled clip catalogue, `public/media/gallery.json`.
 *
 * These clips ship with the app, so their declared metadata is trusted
 * server-side data rather than browser input — it may price an upscale. Every
 * entry is checked once here, and anything malformed or outside the upscale
 * limits is dropped instead of reaching the studio with an invented estimate.
 *
 * `bytes` exists only for that check and is not part of the public `Source`.
 * `setup` travels with the clip so the studio can restore the run that made it;
 * a test checks that every shipped setup still composes its recorded prompt.
 * A clip made outside the studio has no setup, since its exact prompt is not
 * on record; it may name the video `model` that made it instead, so its card
 * carries the right tag without offering a run it cannot restore.
 */
export function parseLibrary(value: unknown): Source[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const clip = readClip(entry);
    return clip ? [clip] : [];
  });
}

const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

function readClip(entry: unknown): Source | null {
  if (!entry || typeof entry !== "object") return null;
  const {
    id,
    label,
    url,
    poster,
    preview,
    previewPoster,
    width,
    height,
    duration,
    bytes,
    setup,
    model,
    description,
  } = entry as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(id) ||
    typeof url !== "string" ||
    !url.startsWith("/media/") ||
    !positive(width) ||
    !Number.isInteger(width) ||
    !positive(height) ||
    !Number.isInteger(height) ||
    !positive(duration) ||
    !positive(bytes) ||
    !Number.isSafeInteger(bytes)
  )
    return null;
  try {
    // A catalogue clip is offered as an upscale source, so it faces an upload's limits.
    checkUpscaleLimits({ width, height, duration }, bytes);
  } catch {
    return null;
  }
  return {
    id,
    label: String(label ?? id)
      .replace(/[\x00-\x1f\x7f]/g, " ")
      .trim()
      .slice(0, 160),
    url,
    width,
    height,
    duration,
    origin: "sample",
    ...(typeof poster === "string" && poster.startsWith("/media/")
      ? { poster }
      : {}),
    ...(typeof preview === "string" && preview.startsWith("/media/")
      ? { preview }
      : {}),
    ...(typeof previewPoster === "string" && previewPoster.startsWith("/media/")
      ? { previewPoster }
      : {}),
    ...(setup && typeof setup === "object" && !Array.isArray(setup)
      ? { setup: readSetup(setup as LibrarySetup) }
      : isVideoModel(model)
        ? { model, ...readAbout(description) }
        : {}),
  };
}

/** A setup-less clip's provenance line: control characters stripped, bounded. */
function readAbout(value: unknown): { about?: string } {
  if (typeof value !== "string") return {};
  const about = value
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .trim()
    .slice(0, 300);
  return about ? { about } : {};
}

/** Only a model the registry knows as a video generator names a clip. */
const isVideoModel = (value: unknown): value is VideoModel =>
  typeof value === "string" &&
  registry.some(
    (entry) =>
      entry.status === "ready" &&
      entry.generator === "video" &&
      entry.videoModel === value,
  );

/**
 * A setup's recorded LTX gaps pass the same check a request's do; a malformed
 * record is dropped, so Recreate restores the description as one text.
 */
function readSetup(setup: LibrarySetup): LibrarySetup {
  if (setup.ltxPrompt === undefined) return setup;
  const ltxPrompt = readLtxPrompt(setup.ltxPrompt);
  if (ltxPrompt) return { ...setup, ltxPrompt };
  const { ltxPrompt: _dropped, ...rest } = setup;
  return rest;
}
