import type { Generator, Job, Source, VideoModel } from "../shared/types";
import { entryFor } from "../shared/registry";
import catalogue from "../public/media/gallery.json";
import { parseLibrary } from "../shared/library";
import { modelSignature } from "./generators";

/**
 * The catalogue clip the studio opens on: the first entry of
 * `public/media/gallery.json`.
 *
 * The frontend imports the same shipped file the local adapter reads and the
 * Worker bundles, so the opening screen and the first-run composer describe one
 * run instead of two. `initialComposer` in `src/useComposer.ts` is built from
 * this clip's recorded setup.
 */
export const librarySources: Source[] = parseLibrary(catalogue);
export const featuredSource: Source | undefined = librarySources[0];

/** The run a catalogue card names: its recorded setup, or the model that made it. */
export const libraryRun = (source: Source) =>
  source.setup ?? { generator: "video" as const, model: source.model };

/**
 * The model tag a catalogue clip carries. A clip made outside the studio names
 * only its model's provenance, never a studio route it did not run on.
 */
export function librarySignature(source: Source) {
  const signature = modelSignature(libraryRun(source));
  return !source.setup && source.model && signature.tag === "H3"
    ? { tag: "H3", title: "MiniMax H3 (open weights)" }
    : signature;
}

/**
 * Curated examples follow the composer; a visitor's session jobs do not. A
 * clip made outside the studio has no run to restore, so it shows in every
 * video mode rather than only beside its own model family.
 */
export function libraryMatchesMode(
  source: Source,
  generator: Generator,
  model?: VideoModel,
): boolean {
  if (!source.setup && source.model)
    return generator === "video" || generator === "upscale";
  const run = libraryRun(source);
  // Upscale accepts video sources from either model family.
  if (generator === "upscale") return run.generator === "video";
  if (run.generator !== generator) return false;
  return (
    entryFor(run.generator, run.model).family ===
    entryFor(generator, model).family
  );
}

/**
 * Presents a catalogue clip's recorded run as a Job.
 *
 * Restore, prompt reuse and the lightbox already speak Job, so a library clip
 * reaches them through the same paths as one of the visitor's own generations
 * instead of a parallel set of props. The synthesised job is never submitted
 * and never enters the polling list: its id names a catalogue entry, not a row
 * in this browser's session.
 */
export function librarySetupJob(source: Source): Job | undefined {
  if (!source.setup) return undefined;
  const { prompt, costUsd, generatedAt, ...input } = source.setup;
  return {
    ...input,
    id: source.id,
    prompt,
    status: "Ready",
    createdAt: generatedAt,
    updatedAt: generatedAt,
    costEstimateUsd: costUsd,
    costActualUsd: costUsd,
    resultUrl: source.url,
    keyMode: "byo",
  };
}
