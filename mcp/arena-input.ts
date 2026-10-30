import { z } from "zod";
import { arenaDraft } from "../shared/arena";

const id = z.string().uuid();
const slot = z.string().regex(/^[a-z0-9-]{1,40}$/);
/** The approach fields an agent sets by voice without resending the draft. */
const patch = z
  .strictObject({
    label: z.string().min(1).max(80),
    prompt: z.string().max(8000),
    notes: z.string().max(3000),
    model: z.string().max(120),
    workflow: z.string().max(160),
    guide: z.string().max(80),
    entry: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .nullable(),
  })
  .partial();
export const arenaAction = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("list") }),
  z.strictObject({ action: z.literal("create"), draft: arenaDraft }),
  z.strictObject({ action: z.literal("read"), id }),
  z.strictObject({
    action: z.literal("link"),
    code: z.string().regex(/^[a-f0-9]{32}$/),
  }),
  z.strictObject({
    action: z.literal("update"),
    id,
    revision: z.number().int().nonnegative(),
    draft: arenaDraft,
  }),
  z.strictObject({
    action: z.literal("upload"),
    id,
    filePath: z.string().min(1).max(4096),
    slot: slot.optional(),
  }),
  z.strictObject({
    action: z.literal("add"),
    id,
    sourceId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    slot: slot.optional(),
  }),
  z.strictObject({ action: z.literal("set_slot"), id, slot, patch }),
  z.strictObject({
    action: z.literal("request_run"),
    id,
    slots: z.array(slot).min(1).max(4).optional(),
  }),
]);

/** Keep the flat public API, with conditional requirements visible to MCP/CLI. */
export const arenaInputShape = {
  action: z.enum([
    "list",
    "create",
    "read",
    "update",
    "link",
    "upload",
    "add",
    "set_slot",
    "request_run",
  ]),
  id: id.optional(),
  code: z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .optional(),
  revision: z.number().int().nonnegative().optional(),
  draft: arenaDraft.optional(),
  filePath: z.string().min(1).max(4096).optional(),
  slot: slot.optional(),
  sourceId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,80}$/)
    .optional(),
  patch: patch.optional(),
  slots: z.array(slot).min(1).max(4).optional(),
};
export const arenaInput = z
  .strictObject(arenaInputShape)
  .superRefine((input, ctx) => {
    const parsed = arenaAction.safeParse(input);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
  })
  .meta({
    allOf: Object.entries({
      create: ["draft"],
      read: ["id"],
      link: ["code"],
      update: ["id", "revision", "draft"],
      upload: ["id", "filePath"],
      add: ["id", "sourceId"],
      set_slot: ["id", "slot", "patch"],
      request_run: ["id"],
    }).map(([action, required]) => ({
      if: { properties: { action: { const: action } }, required: ["action"] },
      then: { required },
    })),
  });
