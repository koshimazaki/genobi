import { z } from "zod";
import {
  DIRECTOR_ID,
  DIRECTOR_OPS,
  NAME_LIMIT,
} from "../shared/director/commands";
import { isClipOp } from "../shared/director/clip-commands";
import { FPS_LIMITS, isEditorOp } from "../shared/director/editor-commands";
import { LAYER_LIMIT } from "../shared/director/types";

const layerId = z.string().regex(DIRECTOR_ID);
const newLayerId = layerId.describe("A new id, not an existing clip or track");
// Control characters become spaces and the ends are trimmed before the length
// is counted, by the shared parser the server runs too.
const name = z.string().min(1).max(NAME_LIMIT);

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
    op: z.literal("set-fps"),
    fps: z.number().int().min(FPS_LIMITS.min).max(FPS_LIMITS.max),
  }),
  z.strictObject({
    op: z.literal("set-duration"),
    durationFrames: z.number().int().min(1).max(1_000_000),
  }),
  z.strictObject({ op: z.literal("rename-project"), name }),
  z.strictObject({ op: z.literal("rename-layer"), layerId, name }),
  z.strictObject({
    op: z.literal("reorder-layer"),
    layerId,
    by: z
      .number()
      .int()
      .min(1 - LAYER_LIMIT)
      .max(LAYER_LIMIT - 1)
      .refine((n) => n !== 0, "by must not be 0")
      .describe("Tracks to move up the stack (positive) or down (negative)"),
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
          (op) =>
            !isClipOp(op) && !isEditorOp(op) && op !== "apply-effect-preset",
        ) as [string, ...string[]],
      ),
    })
    .passthrough(),
]);
