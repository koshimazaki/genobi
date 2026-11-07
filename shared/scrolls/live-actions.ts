import { z } from "zod";
import { DIRECTOR_ID, COPY_ID } from "../director/commands";
import { MEDIA_RECEIPT_ID } from "../project-media";
import { ID } from "./types";
export const directorTarget = z
  .object({
    id: z.string().regex(DIRECTOR_ID),
    revision: z.number().int().min(0),
  })
  .strict()
  .nullable();
const revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
export const scrollAttach = z
  .object({
    op: z.literal("attach-media"),
    revision,
    copyId: z.string().regex(COPY_ID),
    receiptId: z.string().regex(MEDIA_RECEIPT_ID),
    role: z.enum(["character", "panel", "style", "audio"]),
    name: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[^\x00-\x1f\x7f]+$/),
    cellId: z.string().regex(ID).optional(),
  })
  .strict();
export const scrollDirector = z
  .object({
    op: z.literal("handoff-director"),
    revision,
    director: directorTarget,
  })
  .strict();
export const scrollAttachment = z
  .object({
    assetId: z.string().regex(ID),
    sha256: z.string().regex(MEDIA_RECEIPT_ID),
  })
  .strict();
export const scrollDirectorReceipt = z
  .object({
    destinationProjectId: z.string().regex(DIRECTOR_ID),
    destinationRevision: revision,
    assetIds: z.array(z.string().regex(DIRECTOR_ID)).max(48),
    layerIds: z.array(z.string().regex(DIRECTOR_ID)).max(100),
  })
  .strict();
export const scrollMediaInput = z
  .object({
    sha256: z.string().regex(MEDIA_RECEIPT_ID),
    byteLength: z.number().int().min(1).max(50_000_000),
    contentType: z.enum([
      "image/png",
      "image/jpeg",
      "image/webp",
      "audio/wav",
      "audio/flac",
      "audio/mpeg",
    ]),
  })
  .strict();
export type ScrollMediaInput = z.infer<typeof scrollMediaInput>;
