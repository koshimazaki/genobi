// A local media tool's result handed into a linked project copy (Box 2.3 of
// the setup design): a trim, join, crossfade or room an agent made in
// its own studio session, placed in the person's project as a production
// asset like a take. Its record says how it was made: the operation and its
// inputs in order, each with its kind, origin and the project asset holding
// the same bytes, if any. Every step of its history must be the reader's own
// media or a library clip; anything else is refused.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Derivation } from "../shared/director/types";
import { AppError } from "./errors";
import type { JobService } from "./jobs";
import { OPERATION_VERB } from "./media-tools";
import {
  handInIds,
  readMedia,
  type DerivedInput,
  type HandIn,
} from "./project-media";
import type { MediaOperation, Store, StoredSource } from "./store";

/** The most sources one result's history may name, itself left out. */
export const MAX_LINEAGE = 64;

const ORIGIN: Record<StoredSource["origin"], DerivedInput["origin"]> = {
  generated: "take",
  upload: "upload",
  sample: "library",
  derived: "derived",
};

const foreign = () =>
  new AppError(
    403,
    "That result was made from media this session does not own, so it cannot be handed in.",
    "derived_foreign",
  );

/**
 * The derived source `sourceId` as `reader` owns it (the agent's own result,
 * or the person's through the read scope), checked and read for a hand-in.
 */
export async function derivedMedia(
  service: Pick<JobService, "source">,
  store: Store,
  sourceId: string,
  reader: string,
  /**
   * The session a step of the history is read as: the reader's own, or the
   * person's for a clip they picked (`readerOf`, the agent's read scope), as
   * a split upscale's source may be.
   */
  readerFor: (id: string) => string = () => reader,
): Promise<HandIn> {
  const own = (id: string) =>
    store.data.sources.find(
      (s) =>
        s.id === id &&
        s.sessionId === (id === sourceId ? reader : readerFor(id)),
    );
  const source = own(sourceId);
  if (!source) throw new AppError(404, "Source not found.");
  if (source.origin !== "derived")
    throw new AppError(
      400,
      "That source is not a media tool result. Hand a finished take in by its job id.",
      "not_derived",
    );
  const kind = source.mediaType ?? "video";
  if (kind === "image")
    throw new AppError(
      400,
      "A frame is a still. Hand in a video or audio result.",
      "derived_kind",
    );
  const operation = operationOf(source);
  // Library clips are public; anything else in the history must be the
  // reader's own. A missing step cannot be checked, so it is refused too.
  const library = async (id: string) =>
    service.source(id, reader).then(
      () => true,
      () => false,
    );
  const seen = new Set<string>();
  const queue = [...(source.derivedFrom ?? [])];
  if (!queue.length) throw foreign();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (seen.size > MAX_LINEAGE)
      throw new AppError(
        422,
        "This result's history is too long to record. Hand in a shorter chain of edits.",
        "take_refused",
      );
    const step = own(id);
    if (!step) {
      if (!(await library(id))) throw foreign();
      continue;
    }
    if (step.origin === "derived") {
      if (!step.derivedFrom?.length) throw foreign();
      queue.push(...step.derivedFrom);
    }
  }
  const sources: DerivedInput[] = [];
  for (const id of source.derivedFrom!) {
    const step = own(id);
    const resolved = step
      ? { source: step, file: step.filePath, sha256: step.sha256 }
      : await service.source(id, readerFor(id));
    const stepKind = resolved.source.mediaType ?? "video";
    if (stepKind === "image") throw foreign();
    sources.push({
      kind: stepKind,
      origin: ORIGIN[resolved.source.origin],
      sha256: resolved.sha256 ?? (await hashFile(resolved.file)),
    });
  }
  const media = await readMedia(
    source.filePath,
    kind,
    () =>
      new AppError(
        404,
        "The result's media is no longer stored.",
        "take_missing",
      ),
  );
  return {
    ...handInIds("derived", source.id),
    kind,
    ...media,
    prompt: source.label,
    tool: `Genobi ${operation} (local media tools), handed in by an agent`,
    derived: { operation, sources },
  };
}

/** The operation a derived source records, or the one its label names. */
function operationOf(source: StoredSource): Derivation["operation"] {
  const operation =
    source.operation ??
    (Object.entries(OPERATION_VERB).find(([, verb]) =>
      source.label.startsWith(`${verb} of `),
    )?.[0] as MediaOperation | undefined);
  if (!operation || operation === "frames")
    throw new AppError(
      422,
      "The studio did not record how this result was made.",
      "take_refused",
    );
  return operation;
}

/** An input's hash, to find it in the project; unreadable means not found. */
function hashFile(file: string) {
  return new Promise<string | undefined>((resolve) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", () => resolve(undefined))
      .on("end", () => resolve(hash.digest("hex")));
  });
}
