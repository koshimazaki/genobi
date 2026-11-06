import { z } from "zod";
import { COPY_ID, DIRECTOR_ID } from "./director/commands";
import { MEDIA_RECEIPT_ID } from "./project-media";

const assetId = z.string().regex(DIRECTOR_ID);
const receiptId = z.string().regex(MEDIA_RECEIPT_ID);
const use = z.enum(["production", "reference"]);
const layerIds = z.array(assetId).min(1).max(64);
export const projectMediaCommand = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("attach"), receiptId, use }),
  z.strictObject({ op: z.literal("replace"), receiptId, layerIds }),
  z.strictObject({ op: z.literal("relink"), assetId, layerIds }),
  z.strictObject({ op: z.literal("alias"), assetId, use }),
  z.strictObject({ op: z.literal("remove"), assetId }),
]);
export const projectMediaWrite = z.strictObject({
  baseRevision: z.number().int().min(1),
  requestId: z.string().uuid(),
  command: projectMediaCommand,
});
export const linkedMediaWrite = projectMediaWrite.extend({
  copyId: z.string().regex(COPY_ID),
});
export type ProjectMediaCommand = z.infer<typeof projectMediaCommand>;
export interface MediaOperationReceipt {
  requestId: string;
  copyId: string;
  sourceRevision: number;
  revision: number;
  assetIds: string[];
  layerIds: string[];
}
