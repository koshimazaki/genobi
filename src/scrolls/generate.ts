import { applyScrollCommand } from "../../shared/scrolls/commands";
import {
  checkReferenceSizes,
  generationRecord,
  generatorInput,
  resultName,
  type ScrollGenerator,
} from "../../shared/scrolls/generator";
import {
  checkRecordsFit,
  planRuns,
  withFrames,
  type PlannedRun,
  type RunTarget,
} from "../../shared/scrolls/run-plan";
import { inspectImage } from "../../shared/image";
import type { ScrollGeneration } from "../../shared/scrolls/types";
import type { Quote } from "../../shared/quote";
import type { Job } from "../../shared/types";
import { request } from "../useJobs";
import { expectedHeaders } from "../settings-store";
import { readReference } from "../image-files";
import { addFile, assetType, type ScrollBundle } from "./bundle";
import type { ScrollsBridge } from "./bridge";
import type { Approval, approvedRun } from "./approval";

export type QuoteTarget = RunTarget;

/** A submitted Scrolls run, held until its job is collected or ends. */
export interface PendingRun {
  jobId: string;
  documentId: string;
  cellId?: string;
  /** The person's own prompt, which the result records. */
  prompt: string;
  generation: ScrollGeneration;
  /** A Fill panels run: the result goes into its panel if that is still empty. */
  fill?: boolean;
}

/**
 * A panel run whose submission failed without a clear answer. It may have
 * started, so Fill panels skips the panel until the person has checked
 * Camera history and cleared it; its key is kept for that check.
 */
export interface UnconfirmedRun {
  documentId: string;
  cellId: string;
  idempotency: string;
  label: string;
}

/** The references still in the scroll, in the order they were picked. */
export const liveReferences = (bundle: ScrollBundle, ids: readonly string[]) =>
  ids.flatMap((id) => {
    const asset = bundle.document.assets.find(
      (a) => a.id === id && a.kind === "image",
    );
    return asset ? [asset] : [];
  });

/** Reads the picked references as data URLs, with their recorded prompts. */
async function readReferences(bundle: ScrollBundle, ids: readonly string[]) {
  const refs = liveReferences(bundle, ids);
  const bytes = refs.map((a) => bundle.files.get(a.file.path));
  if (bytes.some((b) => !b))
    throw new Error("A reference is missing its media. Reattach it.");
  checkReferenceSizes(bytes.map((b) => b!.length));
  const urls = await Promise.all(
    refs.map((a, i) =>
      readReference(new File([bytes[i]!], a.name, { type: assetType(a) })),
    ),
  );
  return refs.map((a, i) => ({
    name: a.name,
    prompt: a.prompt,
    sha256: a.file.sha256,
    size: bytes[i]!.length,
    url: urls[i],
  }));
}

/**
 * Quotes every run a target needs through the Camera's quote route, each on
 * its own with its own key. Before anything is quoted, each run's own prompt
 * must fit an asset and every result must fit the scroll (64 KB, 48 assets),
 * so a paid result can always be recorded. Nothing is submitted.
 */
export async function quoteTarget(
  bridge: ScrollsBridge,
  bundle: ScrollBundle,
  generator: ScrollGenerator,
  references: string[],
  target: QuoteTarget,
  unconfirmed: readonly string[] = [],
): Promise<Approval[]> {
  const doc = bundle.document,
    refs = await readReferences(bundle, references),
    runs = planRuns(
      doc,
      target,
      unconfirmed,
      refs.map((r) => r.sha256),
    ),
    generation = generationRecord(generator.entry, refs);
  checkRecordsFit(doc, generator.entry, runs, generation);
  const quoted: Approval[] = [];
  for (const run of runs) {
    // A panel's own 3D frames go first; the board's references follow.
    const frames = await readReferences(bundle, run.frames);
    checkReferenceSizes([...frames, ...refs].map((r) => r.size));
    quoted.push(
      await quoteRun(
        bridge,
        bundle,
        generator,
        run,
        refs,
        frames,
        withFrames(doc, generation, run),
      ),
    );
  }
  return quoted;
}

async function quoteRun(
  bridge: ScrollsBridge,
  bundle: ScrollBundle,
  generator: ScrollGenerator,
  run: PlannedRun,
  references: Awaited<ReturnType<typeof readReferences>>,
  frames: Awaited<ReturnType<typeof readReferences>>,
  generation: ScrollGeneration,
): Promise<Approval> {
  const input = generatorInput(bundle.document, generator, {
    cellId: run.cellId,
    includePlan: run.includePlan,
    references,
    frames,
  });
  const result = await request<{ quote: Quote }>("/api/quotes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bridge.key ? { "x-byo-key": bridge.key } : {}),
      ...expectedHeaders(input),
    },
    body: JSON.stringify(input),
  });
  return {
    quote: result.quote,
    input,
    revision: bundle.document.revision,
    cellId: run.cellId,
    idempotency: crypto.randomUUID(),
    ...(run.fill ? { fill: true } : {}),
    prompt: run.prompt,
    label: run.label,
    generation,
  };
}

/**
 * Submits approved runs one at a time. The first failure stops the rest and
 * says how many started; nothing is retried, and no key is reused. A failed
 * panel run is reported as unconfirmed, by name, since it may have started.
 */
export async function submitRuns(
  bridge: ScrollsBridge,
  documentId: string,
  quoted: readonly Approval[],
  runs: readonly ReturnType<typeof approvedRun>[],
  started: (run: PendingRun) => void,
  uncertain: (run: UnconfirmedRun) => void = () => {},
) {
  for (const [i, run] of runs.entries()) {
    const a = quoted[i];
    try {
      const job = await bridge.generate(run.input, run.approval);
      started({
        jobId: job.id,
        documentId,
        cellId: a.cellId,
        prompt: a.prompt,
        generation: a.generation,
        ...(a.fill ? { fill: true } : {}),
      });
    } catch (error) {
      if (a.cellId)
        uncertain({
          documentId,
          cellId: a.cellId,
          idempotency: a.idempotency,
          label: a.label,
        });
      const sent = i ? ` ${i} of ${runs.length} runs had started.` : "";
      const which = a.cellId
        ? ` ${a.label} may have started: Fill panels skips it until you check Camera history and clear it.`
        : "";
      throw new Error(
        `${(error as Error).message}${sent}${which} No automatic retry was made. Check Camera's generation history before starting another run.`,
        { cause: error },
      );
    }
  }
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Brings a finished run into the scroll it was made for: a new sheet (shown
 * on the board) or a cell candidate, named after its model, with the prompt
 * and the references it was made like. Throws, leaving the result in Camera
 * history, when the scroll was replaced or the media is gone.
 */
export async function collectScroll(
  before: ScrollBundle,
  job: Job,
  pending: PendingRun,
): Promise<{ bundle: ScrollBundle; assetId: string; placed: boolean }> {
  if (before.document.id !== pending.documentId)
    throw new Error(
      "The image is in Camera history; this scroll was replaced before it finished.",
    );
  if (!job.resultUrl || job.mediaAvailable === false)
    throw new Error("The result is no longer available.");
  const response = await fetch(job.resultUrl, { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      "Could not collect the result. It remains in Camera history.",
    );
  const blob = await response.blob();
  const { contentType } = inspectImage(
    new Uint8Array(await blob.arrayBuffer()),
  );
  const name = resultName(
    before.document,
    pending.generation.entry,
    pending.cellId,
    EXT[contentType] ?? "png",
  );
  let next = await addFile(
    before,
    new File([blob], name, { type: contentType }),
    before.document.kind === "character" ? "character" : "panel",
    pending.cellId,
    pending.prompt,
    pending.generation,
  );
  const assetId = next.document.assets.at(-1)!.id;
  const cell = next.document.cells.find((c) => c.id === pending.cellId);
  const command = !pending.cellId
    ? { op: "brief", sheetAssetId: assetId }
    : pending.fill && cell && !cell.assetId
      ? { op: "cell", cell: { ...cell, assetId } }
      : undefined;
  if (command)
    next = {
      ...next,
      document: applyScrollCommand(next.document, {
        revision: next.document.revision,
        ...command,
      }),
    };
  // The asset ID is what a later Send to Director or Add to assets takes.
  // `placed`: it became the sheet, or went into its still-empty panel.
  return { bundle: next, assetId, placed: !!command };
}
