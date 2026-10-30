import { utf8Bytes } from "../ninja-layout";
import { imageInput } from "./prompts";
import {
  emptyPanels,
  generatorPrompt,
  referenceProblem,
  generationRecord,
  resultName,
  type ReferencePair,
  type ScrollGenerator,
} from "./generator";
import { panelFrames } from "./panel-frames";
import {
  fail,
  MAX_ASSETS,
  PROMPT_LIMIT,
  SCROLLS_LIMIT,
  type ScrollDocument,
  type ScrollGeneration,
} from "./types";

/**
 * What one Generate button quotes: the whole sheet (`plan: false`, the brief
 * alone), the whole board (`plan: true`, the brief with the panels compiled
 * under it), one cell, or every empty panel, each its own run.
 */
export type RunTarget =
  | { kind: "sheet"; plan: boolean }
  | { kind: "cell"; cellId: string }
  | { kind: "fill" };

/** One run a button will quote, with the words its result records. */
export interface PlannedRun {
  cellId?: string;
  includePlan: boolean;
  fill?: boolean;
  /**
   * The person's own prompt: the brief and, for a board or a cell, the
   * compiled panels. Never the example pairs, so a result used as a reference
   * later carries only its own words and examples never nest.
   */
  prompt: string;
  /** "Panel 3 (Clash)", or "The sheet", for messages. */
  label: string;
  /** Asset IDs of the panel's own frames, sent ahead of the board references. */
  frames: string[];
}

export function panelLabel(doc: ScrollDocument, cellId?: string) {
  const index = doc.cells.findIndex((c) => c.id === cellId);
  if (index < 0) return "The sheet";
  const title = doc.cells[index].title.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return `Panel ${index + 1}${title ? ` (${title})` : ""}`;
}

/** Fill panels' targets: empty panels, less those with an unconfirmed run. */
export const fillTargets = (
  doc: ScrollDocument,
  unconfirmed: readonly string[] = [],
) => emptyPanels(doc).filter((c) => !unconfirmed.includes(c.id));

export function planRuns(
  doc: ScrollDocument,
  target: RunTarget,
  unconfirmed: readonly string[] = [],
  /** Hashes of the board's references, which a panel frame never repeats. */
  boardHashes: readonly string[] = [],
): PlannedRun[] {
  const run = (
    cellId: string | undefined,
    includePlan: boolean,
    fill = false,
  ) => {
    const prompt = imageInput(doc, cellId, includePlan).description;
    if (prompt.length > PROMPT_LIMIT)
      fail("The prompt exceeds 4,000 characters. Shorten the brief.");
    return {
      ...(cellId ? { cellId } : {}),
      includePlan,
      ...(fill ? { fill } : {}),
      prompt,
      label: panelLabel(doc, cellId),
      frames: panelFrames(doc, cellId, boardHashes).map((a) => a.id),
    };
  };
  if (target.kind === "sheet") return [run(undefined, target.plan)];
  if (target.kind === "cell") return [run(target.cellId, false)];
  const cells = fillTargets(doc, unconfirmed);
  if (!cells.length)
    fail(
      emptyPanels(doc).length
        ? "Every empty panel has an unconfirmed run. Check Camera history, then clear it."
        : "Every panel already has an image. Remove one to refill it.",
    );
  return cells.map((c) => run(c.id, true, true));
}

/**
 * Refuses, before anything is quoted, results that could not be recorded:
 * more than the asset cap, or a document past 64 KB once every result the
 * runs would add is in it (the longest name, path and IDs are assumed).
 */
export function checkRecordsFit(
  doc: ScrollDocument,
  entry: string,
  runs: readonly PlannedRun[],
  generation: ScrollGeneration,
) {
  if (doc.assets.length + runs.length > MAX_ASSETS)
    fail(
      `Scrolls holds up to ${MAX_ASSETS} images and audio; these ${runs.length} results would pass it. Remove some first.`,
    );
  const projected: ScrollDocument = JSON.parse(JSON.stringify(doc));
  runs.forEach((run, i) => {
    const id = `asset-${String(i).padStart(36, "0")}`;
    projected.assets.push({
      id,
      name: resultName(doc, entry, run.cellId, "jpeg"),
      role: doc.kind === "character" ? "character" : "panel",
      kind: "image",
      origin: "generated",
      file: { path: `media/${id}.jpeg`, sha256: "0".repeat(64) },
      ...(run.cellId ? { cellId: run.cellId } : {}),
      prompt: run.prompt,
      generation: withFrames(doc, generation, run),
    });
    const cell = projected.cells.find((c) => c.id === run.cellId);
    if (run.fill && cell) cell.assetId = id;
    if (!run.cellId) projected.sheetAssetId = id;
  });
  projected.revision += runs.length * 2;
  if (utf8Bytes(JSON.stringify(projected)) > SCROLLS_LIMIT)
    fail(
      "These results would make the scroll larger than 64 KB. Save it, remove results or shorten prompts, then quote again.",
    );
}

/** A run's record: its panel frames first, then the board's references. */
export function withFrames(
  doc: ScrollDocument,
  generation: ScrollGeneration,
  run: Pick<PlannedRun, "frames">,
): ScrollGeneration {
  const frames = run.frames.map((id) => doc.assets.find((a) => a.id === id)!);
  return generationRecord(generation.entry, [
    ...frames.map((a) => ({ name: a.name, sha256: a.file.sha256 })),
    ...generation.references,
  ]);
}

/**
 * Why a button cannot quote yet, or undefined: the reference route, the
 * prompt limits, the compiled length and whether every result would fit.
 * The composer disables the button and shows this in the preview.
 */
export function runProblem(
  doc: ScrollDocument,
  generator: ScrollGenerator,
  references: readonly (ReferencePair & { sha256: string })[],
  target: RunTarget,
  unconfirmed: readonly string[] = [],
): string | undefined {
  try {
    // The board's own route first, unless a panel frame supplies the image
    // a route needs (FLUX 3 Edit on a board of 3D frames, say).
    const route = referenceProblem(generator.entry, references.length);
    let runs: PlannedRun[];
    try {
      runs = planRuns(
        doc,
        target,
        unconfirmed,
        references.map((r) => r.sha256),
      );
    } catch (error) {
      return route ?? (error as Error).message;
    }
    if (route && !runs.some((r) => r.frames.length)) return route;
    for (const run of runs) {
      const frames = run.frames.map((id) =>
        doc.assets.find((a) => a.id === id)!,
      );
      const problem = referenceProblem(
        generator.entry,
        frames.length + references.length,
      );
      if (problem)
        return frames.length
          ? `${run.label} has its own 3D frame. ${problem}`
          : problem;
      generatorPrompt(doc, { ...run, pairs: references, frames });
    }
    checkRecordsFit(doc, generator.entry, runs, {
      entry: generator.entry,
      references: references.map((r) => ({ name: r.name, sha256: r.sha256 })),
    });
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}
