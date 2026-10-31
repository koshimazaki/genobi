import { z } from "zod";
import { DIRECTOR_ID, DIRECTOR_OPS } from "../shared/director/commands";
import { isClipOp } from "../shared/director/clip-commands";

const layerId = z.string().regex(DIRECTOR_ID);
const newLayerId = layerId.describe("A new id, not an existing clip or track");

/** Concrete schemas make the basic timeline controls discoverable by CLI/MCP. */
export const directorCommandSchema = z.union([
  z.strictObject({ op: z.literal("remove-clip"), layerId }),
  z.strictObject({ op: z.literal("duplicate-clip"), layerId, newLayerId }),
  z.strictObject({
    op: z.literal("split-clip"),
    layerId,
    frame: z.number().int().min(0).max(1_000_000),
    newLayerId,
  }),
  z.strictObject({ op: z.literal("set-muted"), layerId, muted: z.boolean() }),
  z.strictObject({
    op: z.literal("set-gain"),
    layerId,
    gain: z.number().min(0).max(2),
  }),
  z.strictObject({
    op: z.literal("apply-effect-preset"),
    presetId: layerId,
    instanceId: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,43}$/)
      .describe("A fresh prefix for all inserted layer ids"),
    expectedRevision: z.number().int().nonnegative(),
    startFrame: z.number().int().min(0).max(1_000_000),
    durationFrames: z.number().int().min(1).max(1_000_000),
    parameters: z
      .record(
        z.string(),
        z.union([z.string().max(200), z.number().finite(), z.boolean()]),
      )
      .optional(),
    variant: z.record(z.string(), z.unknown()).optional(),
    sourceLayerId: layerId.optional(),
  }),
  // Existing commands retain the common parser's full validation. New clip
  // commands cannot fall through this branch after failing a strict schema.
  z
    .object({
      op: z.enum(
        DIRECTOR_OPS.filter(
          (op) => !isClipOp(op) && op !== "apply-effect-preset",
        ) as [string, ...string[]],
      ),
    })
    .passthrough(),
]);
