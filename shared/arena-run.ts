import { z } from "zod";
import { defaultAcoustic } from "./acoustic";
import { ARENA_MAX_SECONDS } from "./arena-limits";
import { defaultCamera } from "./camera";
import { fitControls } from "./controls";
import { needsSourceMedia } from "./h3";
import { readyEntry, registry, type ReadyEntry } from "./registry";
import type { AspectRatio, GenerateInput, VideoResolution } from "./types";
import {
  IMAGE_ASPECT_RATIOS,
  KLEIN_RESOLUTIONS,
  type ImageAspectRatio,
  type ImageResolution,
} from "./image";
import type { ArenaDraft, ArenaSlot } from "./arena";

/**
 * An approach's run: the registry entry it runs, the idempotency key saved
 * before the paid submission, and the job that key made. The key is kept so a
 * later press replays the same request instead of paying twice.
 */
export const arenaRun = z.strictObject({
  entry: z.string().regex(/^[a-z0-9-]{1,40}$/),
  key: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
});
export type ArenaRun = z.infer<typeof arenaRun>;

/** Every ratio and tier a run entry offers; `fitControls` narrows per entry. */
export const ARENA_ASPECTS: readonly AspectRatio[] = [
  "21:9",
  "2:1",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
];
export const ARENA_RESOLUTIONS: readonly VideoResolution[] = [
  "hd",
  "fhd",
  "qhd",
  "uhd",
];

/**
 * The generator's shared settings, saved with the comparison so the record
 * says what was asked for. Each load fits them to its own model with
 * `fitControls`, exactly as the Camera composer does when its model changes.
 */
export const arenaSettings = z.strictObject({
  duration: z.number().int().min(1).max(ARENA_MAX_SECONDS).optional(),
  aspectRatio: z
    .enum(ARENA_ASPECTS as [AspectRatio, ...AspectRatio[]])
    .optional(),
  resolution: z
    .enum(ARENA_RESOLUTIONS as [VideoResolution, ...VideoResolution[]])
    .optional(),
  imageResolution: z.enum(KLEIN_RESOLUTIONS).optional(),
  imageAspectRatio: z.enum(IMAGE_ASPECT_RATIOS).optional(),
});
export interface ArenaSettings {
  /** Whole seconds; a video load moves it to the nearest length it offers. */
  duration?: number;
  aspectRatio?: AspectRatio;
  resolution?: VideoResolution;
  imageResolution?: ImageResolution;
  imageAspectRatio?: ImageAspectRatio;
}

/**
 * The prompt a load generates with: its own override when it has one,
 * otherwise the comparison's main prompt. Whitespace is not an override.
 */
export const slotPrompt = (
  slot: Pick<ArenaSlot, "prompt">,
  draft: Pick<ArenaDraft, "prompt">,
) => (slot.prompt.trim() ? slot.prompt : draft.prompt);

/** The settings a draft's runs use: its saved settings, its source length. */
export const draftSettings = (
  draft: Pick<ArenaDraft, "settings" | "sourceSeconds">,
): ArenaSettings => ({
  ...draft.settings,
  // A source under half a second still asks for the shortest whole second.
  duration:
    draft.settings?.duration ??
    Math.max(1, Math.round(draft.sourceSeconds ?? 5)),
});

/**
 * Entries an approach can run: text to video (Router models and the
 * Acoustic Space and open LTX workflows) and stills (FLUX 3 Image on Router,
 * Klein as a workflow on the run location, Klein on BFL's API). An approach
 * carries only a prompt and still references, so models that need a guide
 * video or a start image (H3, FLUX 3 image-to-video) are not offered.
 */
export const arenaRunEntries = (): ReadyEntry[] =>
  registry.filter(
    (e): e is ReadyEntry =>
      e.status === "ready" &&
      (e.generator === "video" || e.generator === "image") &&
      !needsSourceMedia(e.videoModel),
  );

/** An entry's name in Arena: its model and task, as the model menu shows them. */
export const runName = (entry: ReadyEntry) =>
  entry.task ? `${entry.label} · ${entry.task}` : entry.label;

/** Whether a run on this entry takes the comparison's image references. */
export const takesReferences = (entryId: string) => {
  const entry = readyEntry(entryId);
  return entry?.controls.kind === "image" && entry.controls.references;
};

/**
 * The request an approach sends: its prompt on the entry's own controls,
 * with no camera clause. The generator's settings (16:9 HD and 5 seconds
 * unless chosen) are fitted to what the entry offers. A still defaults to 1K
 * at the entry's own ratio and carries the comparison's image references
 * (data URLs) when the entry takes them.
 */
export function arenaRunInput(
  entryId: string,
  prompt: string,
  settings: ArenaSettings = {},
  references: string[] = [],
): GenerateInput {
  const entry = readyEntry(entryId);
  if (!entry || (entry.generator !== "video" && entry.generator !== "image"))
    throw new Error("Choose a video or image model for this approach.");
  const description = prompt.trim();
  if (!description) throw new Error("Write a prompt before running.");
  const takesAcoustic =
    entry.controls.kind === "video" && entry.controls.acoustic;
  const image = entry.generator === "image";
  return fitControls(entry.controls, {
    generator: entry.generator,
    model: entry.videoModel,
    description,
    // The camera clause is off; the request still names a valid selection.
    camera: defaultCamera,
    cameraEdits: {},
    cameraEnabled: false,
    duration: image ? 5 : Math.round(settings.duration ?? 5),
    resolution: settings.resolution ?? "hd",
    aspectRatio: image ? "1:1" : (settings.aspectRatio ?? "16:9"),
    draft: false,
    upscaleFactor: 2,
    upscaleCreativity: 0,
    ...(takesAcoustic ? { acoustic: defaultAcoustic } : {}),
    ...(image
      ? {
          imageReferences: takesReferences(entryId)
            ? references.slice(0, 10)
            : [],
          imageResolution: settings.imageResolution ?? "1k",
          imageAspectRatio: settings.imageAspectRatio ?? "auto",
          imageGrounding: false,
          imageSafetyTolerance: 2,
        }
      : {}),
  });
}

/** What `set_slot` may change on one approach. */
export interface SlotPatch {
  label?: string;
  prompt?: string;
  notes?: string;
  model?: string;
  workflow?: string;
  guide?: string;
  /** A run entry id, or null for Record only. */
  entry?: string | null;
}

/**
 * One approach changed by name, the rest of the draft kept, so an agent
 * edits a slot without resending the comparison. A new entry is a new
 * request, so the saved key and run go with the old one.
 */
export function patchSlot(
  draft: ArenaDraft,
  slotId: string,
  { entry, ...fields }: SlotPatch,
): ArenaDraft {
  if (!draft.slots.some((s) => s.id === slotId))
    throw new Error(`No approach "${slotId}" in this comparison.`);
  const chosen =
    entry === undefined || entry === null
      ? undefined
      : arenaRunEntries().find((e) => e.id === entry);
  if (entry && !chosen)
    throw new Error(
      `Run entries: ${arenaRunEntries()
        .map((e) => e.id)
        .join(", ")}.`,
    );
  return {
    ...draft,
    slots: draft.slots.map((s) => {
      if (s.id !== slotId) return s;
      const next = { ...s, ...fields };
      if (entry === null) delete next.run;
      if (chosen && s.run?.entry !== chosen.id) {
        next.run = { entry: chosen.id };
        if (fields.model === undefined) next.model = runName(chosen);
      }
      return next;
    }),
  };
}
