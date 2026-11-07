import { z } from "zod";
import { applyScrollCommand } from "./commands";
import { ID, parseScroll, type ScrollDocument } from "./types";

export const scrollContext = z
  .object({
    documentId: z.string().regex(ID),
    revision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    cellId: z.string().regex(ID).nullable(),
  })
  .strict();
export type ScrollContext = z.infer<typeof scrollContext>;
export const liveScrollRequest = z
  .object({
    requestId: z.string().uuid(),
    tabId: z.string().uuid(),
    context: scrollContext,
    command: z.record(z.string(), z.unknown()),
  })
  .strict();
export type LiveScrollRequest = z.infer<typeof liveScrollRequest>;
export interface ScrollSnapshot {
  document: ScrollDocument;
  context: ScrollContext;
  availableAssetIds: string[];
}
export function scrollSnapshot(value: unknown): ScrollSnapshot {
  const raw = z
    .object({
      document: z.unknown(),
      context: scrollContext,
      availableAssetIds: z.array(z.string().regex(ID)).max(48),
    })
    .strict()
    .parse(value);
  const document = parseScroll(raw.document);
  if (
    raw.context.documentId !== document.id ||
    raw.context.revision !== document.revision ||
    (raw.context.cellId !== null &&
      !document.cells.some((c) => c.id === raw.context.cellId)) ||
    new Set(raw.availableAssetIds).size !== raw.availableAssetIds.length ||
    raw.availableAssetIds.some(
      (id) => !document.assets.some((a) => a.id === id),
    )
  )
    throw new Error(
      "Scroll snapshot does not match its document or selection.",
    );
  return { ...raw, document };
}
export function sameScrollContext(a: ScrollContext, b: ScrollContext) {
  return (
    a.documentId === b.documentId &&
    a.revision === b.revision &&
    a.cellId === b.cellId
  );
}
export function liveScrollEdit(
  snapshot: ScrollSnapshot,
  request: LiveScrollRequest,
) {
  if (!sameScrollContext(snapshot.context, request.context))
    throw new Error(
      "The Scroll document, revision or selected cell changed. Inspect again; preserve the person's edits.",
    );
  if (request.command.op === "add-asset")
    throw new Error(
      "Use owned media attachment; metadata alone cannot add a live asset.",
    );
  return applyScrollCommand(snapshot.document, request.command);
}
export interface LiveScrollStatus {
  id: string;
  request: LiveScrollRequest;
  state: "queued" | "running" | "done" | "error";
  result?: ScrollSnapshot;
  error?: string;
}
