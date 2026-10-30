import { fitControls, type ImageControls } from "../controls";
import {
  estimateImageUsd,
  IMAGE_DESCRIPTION_LIMIT,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_REFERENCES,
  MAX_IMAGE_REQUEST_BYTES,
  type ImageAspectRatio,
  type ImageResolution,
} from "../image";
import { readyEntry, registry, runOptions, type ReadyEntry } from "../registry";
import type { GenerateInput } from "../types";
import { imageInput } from "./prompts";
import { frameClause } from "./panel-frames";
import { fail, type ScrollDocument, type ScrollGeneration } from "./types";

/**
 * The Scrolls generator: one sheet or cell image from the brief, optionally
 * "like these" Scrolls sheets. It runs the Camera's registry entries with
 * their own controls (`fitControls`), so a ratio or tier an entry cannot take
 * moves the way the Camera composer moves it, and the server's image
 * validation holds the request to the same entry.
 *
 * - FLUX 3 Image Klein, Open: Comfy's Klein graph on the workflow route. It
 *   takes text only (`kleinOpenControls.references` is false).
 * - FLUX 3 Image Klein, API: BFL's `POST /v1/flux-3-image-klein`, up to ten
 *   references (docs.bfl.ai, checked 21 October 2026). Needs a BFL key.
 * - FLUX 3 Edit: Router's `bfl/flux-3-image` edit, closed, on a Comfy key; the
 *   route the anime teaser uses to redraw the Scrolls examples.
 * - FLUX 3 Image: Router, closed, references optional.
 *
 * Nothing moves between entries by itself: Open with references is refused
 * with the two routes that take them, never switched to one.
 */
export type ScrollEntryId = string;
type ImageEntry = ReadyEntry & { controls: ImageControls };

/**
 * Every ready image or edit entry in the registry, the rows the Camera's
 * image menu draws from; a new image entry appears here without a change.
 */
export const scrollEntries = (): ImageEntry[] =>
  registry.filter(
    (e): e is ImageEntry =>
      e.status === "ready" &&
      e.controls.kind === "image" &&
      (e.generator === "image" || e.generator === "edit"),
  );

/** The model menu: one row per model (Klein's two runs share one). */
export const scrollModels = () =>
  scrollEntries()
    .filter((e) => !e.runOf)
    .map((e) => ({
      id: e.id,
      label: `${e.label}${e.task && !e.label.includes(e.task) ? ` · ${e.task}` : ""} · ${e.open ? "open weights" : "closed"}`,
    }));

export interface ScrollGenerator {
  entry: ScrollEntryId;
  imageAspectRatio: ImageAspectRatio;
  imageResolution: ImageResolution;
}
export const DEFAULT_GENERATOR: ScrollGenerator = {
  entry: "flux-3-klein",
  imageAspectRatio: "16:9",
  imageResolution: "1k",
};

/** Combined reference bytes, as `server/validate-image.ts` bounds them. */
export const MAX_REFERENCE_TOTAL = MAX_IMAGE_REQUEST_BYTES * 0.7;

export function scrollEntry(id: string): ReadyEntry & {
  controls: ImageControls;
} {
  const entry = scrollEntries().find((e) => e.id === id);
  if (!entry) fail("Choose an image model.");
  return entry!;
}

/** Klein's Run choice (open graph or BFL API), or null for a closed entry. */
export const scrollRun = (id: ScrollEntryId) => runOptions(scrollEntry(id));

/** "FLUX 3 Image Klein · API", as the approval and a result's label say. */
export function entryLabel(id: string) {
  const entry = readyEntry(id);
  if (!entry) return "Unknown model";
  const run = runOptions(entry);
  return run
    ? `${entry.label} · ${run.held === "api" ? "API" : "Open"}`
    : `${entry.label} ${entry.task ?? ""}`.trim();
}

/** Applies a menu choice and refits the ratio and tier to the new entry. */
export function fitGenerator(next: ScrollGenerator): ScrollGenerator {
  const { controls } = scrollEntry(next.entry);
  // Only the image half applies to an image entry; the video values are parked.
  const fitted = fitControls(controls, {
    duration: 6,
    aspectRatio: "16:9",
    resolution: "fhd",
    draft: false,
    cameraEnabled: false,
    imageAspectRatio: next.imageAspectRatio,
    imageResolution: next.imageResolution,
    imageGrounding: false,
  });
  return {
    entry: next.entry,
    imageAspectRatio: fitted.imageAspectRatio ?? next.imageAspectRatio,
    imageResolution: fitted.imageResolution ?? next.imageResolution,
  };
}

/**
 * Why this entry cannot take this many references, naming the routes that
 * can; undefined when it can.
 */
export function referenceProblem(
  id: ScrollEntryId,
  count: number,
): string | undefined {
  const entry = scrollEntry(id);
  if (count > MAX_IMAGE_REFERENCES)
    return `Use up to ${MAX_IMAGE_REFERENCES} references.`;
  if (count && !entry.controls.references)
    return "Klein's open graph takes text only. For references, choose Run: API (BFL key) or FLUX 3 Edit (closed, Comfy key), or remove them.";
  if (!count && entry.generator === "edit")
    return "FLUX 3 Edit redraws a reference: add at least one sheet to make one like it.";
  return undefined;
}

/** Each reference's bytes, held to the server's per-file and combined limits. */
export function checkReferenceSizes(sizes: readonly number[]) {
  if (sizes.some((size) => size > MAX_IMAGE_BYTES))
    fail("Each reference must be 5 MB or smaller; use a smaller sheet.");
  if (sizes.reduce((sum, size) => sum + size, 0) > MAX_REFERENCE_TOTAL)
    fail("Keep all references under 11 MB combined; remove one.");
}

/** A reference and the prompt recorded with it, if any. */
export interface ReferencePair {
  name: string;
  prompt?: string;
}
/** How much of a reference's recorded prompt is quoted to the model. */
export const QUOTED_PROMPT = 600;
const quoted = (prompt: string) =>
  prompt.length > QUOTED_PROMPT
    ? `${prompt.slice(0, QUOTED_PROMPT).trimEnd()}…`
    : prompt;

/**
 * The words that tell the model what the references are for: each one, with
 * the prompt it was made from when one is recorded (never an invented one),
 * then "make one the same way, changed to" the brief that follows.
 */
export function referenceClause(
  kind: ScrollDocument["kind"],
  pairs: readonly ReferencePair[],
  /** Images ahead of these (a panel's own frames), so numbering matches. */
  offset = 0,
) {
  const what = kind === "character" ? "character sheet" : "storyboard";
  const one = pairs.length === 1;
  return [
    `Made like ${one ? "this example" : `these ${pairs.length} examples`}, the reference image${one ? "" : "s"} in order:`,
    ...pairs.map(
      (p, i) =>
        `Reference ${offset + i + 1}: ${p.prompt?.trim() ? `its prompt: "${quoted(p.prompt.trim())}"` : "no prompt recorded"}.`,
    ),
    `Make a new ${what} the same way, with the same layout, panel structure and drawing style, changed to:`,
  ].join("\n");
}

/** Storyboard panels with no image yet: what Fill panels makes, in order. */
export const emptyPanels = (doc: ScrollDocument) =>
  doc.cells.filter((c) => !c.assetId);

/**
 * The exact words a run sends: the panel's own frames (see `panel-frames.ts`)
 * when it has any, the reference clause when there are references, then the brief, then (for a board or a cell) the panels in
 * order with their timing, camera and action. The preview shows this text.
 */
export function generatorPrompt(
  doc: ScrollDocument,
  options: {
    cellId?: string;
    includePlan?: boolean;
    pairs?: readonly ReferencePair[];
    /** This panel's own frames, sent ahead of the pairs. */
    frames?: readonly ReferencePair[];
  },
) {
  const { description } = imageInput(
    doc,
    options.cellId,
    options.includePlan ?? false,
  );
  const pairs = options.pairs ?? [],
    frames = options.frames?.length ?? 0;
  const prompt = [
    frameClause(frames),
    pairs.length ? referenceClause(doc.kind, pairs, frames) : "",
    description,
  ]
    .filter(Boolean)
    .join("\n");
  if (prompt.length > IMAGE_DESCRIPTION_LIMIT)
    fail("The prompt with its references is too long. Shorten the brief.");
  return prompt;
}

/**
 * The request a quote prices and an approval submits: the brief (with the
 * plan when asked), the held entry's generator and model, the references as
 * data URLs, and a ratio and tier that entry takes.
 */
export function generatorInput(
  doc: ScrollDocument,
  generator: ScrollGenerator,
  options: {
    cellId?: string;
    includePlan?: boolean;
    references?: readonly (ReferencePair & { url: string })[];
    frames?: readonly (ReferencePair & { url: string })[];
  },
): GenerateInput {
  const references = options.references ?? [],
    frames = options.frames ?? [];
  const problem = referenceProblem(
    generator.entry,
    frames.length + references.length,
  );
  if (problem) fail(problem);
  const entry = scrollEntry(generator.entry);
  const fitted = fitGenerator(generator);
  const base = imageInput(doc, options.cellId, options.includePlan ?? false);
  return {
    ...base,
    generator: entry.generator,
    model: entry.videoModel,
    description: generatorPrompt(doc, {
      ...options,
      pairs: references,
      frames,
    }),
    imageReferences: [...frames, ...references].map((r) => r.url),
    imageAspectRatio: fitted.imageAspectRatio,
    imageResolution: fitted.imageResolution,
  };
}

/** One run's estimate, from the same table the quote uses. */
export const estimatePerRun = (generator: ScrollGenerator) =>
  estimateImageUsd({
    model: scrollEntry(generator.entry).videoModel,
    imageResolution: fitGenerator(generator).imageResolution,
  });

const CONTROL = /[\x00-\x1f\x7f]/g;
/** A display or provenance name: no control characters, at most 120. */
export const cleanName = (name: string) =>
  name.replace(CONTROL, "").trim().slice(0, 120);

/** What a generated result records about how it was made. */
export function generationRecord(
  entry: ScrollEntryId,
  references: readonly { name: string; sha256: string }[],
): ScrollGeneration {
  return {
    entry,
    references: references.map((r) => ({
      name: cleanName(r.name) || "Reference",
      sha256: r.sha256,
    })),
  };
}

/**
 * A result's name: the model and what it made, e.g. "FLUX 3 Image Klein · API
 * · storyboard.png", with the extension of the measured image type so Save
 * downloads it with one.
 */
export function resultName(
  doc: Pick<ScrollDocument, "kind" | "cells">,
  entry: ScrollEntryId,
  cellId?: string,
  ext?: string,
) {
  const index = cellId ? doc.cells.findIndex((c) => c.id === cellId) : -1;
  const what = cellId
    ? `cell ${index + 1}`
    : doc.kind === "character"
      ? "character sheet"
      : "storyboard";
  const name = cleanName(`${entryLabel(entry)} · ${what}`);
  return ext ? `${name.slice(0, 119 - ext.length)}.${ext}` : name;
}
