import { z } from "zod";
import { ARENA_MAX_BYTES, ARENA_MAX_SECONDS } from "./arena-limits";
import { arenaRun, arenaSettings } from "./arena-run";

const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      // Control characters are refused before labels reach storage or exports.
      (value) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value),
      "Use plain text.",
    );
export const arenaSlot = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    label: text(80),
    model: text(120),
    workflow: text(160),
    guide: text(80),
    prompt: text(8000).default(""),
    seed: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    gpuSeconds: z.number().nonnegative().max(86400).optional(),
    notes: text(3000).default(""),
    status: z.enum(["draft", "running", "ready", "error"]).default("draft"),
    media: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    run: arenaRun.optional(),
  })
  .strict();
export const arenaDraft = z
  .object({
    title: text(120).min(1),
    prompt: text(8000).default(""),
    notes: text(6000).default(""),
    sourceSeconds: z.number().positive().max(ARENA_MAX_SECONDS).optional(),
    /** The generator's shared duration, ratio and resolution. */
    settings: arenaSettings.optional(),
    slots: z.array(arenaSlot).min(2).max(4),
    preferred: z.string().max(40).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set(value.slots.map((s) => s.id));
    if (
      ids.size !== value.slots.length ||
      (value.preferred && !ids.has(value.preferred))
    )
      ctx.addIssue({
        code: "custom",
        message: "Use distinct slots and a preference within this comparison.",
      });
  });
export type ArenaDraft = z.infer<typeof arenaDraft>;
export type ArenaSlot = z.infer<typeof arenaSlot>;
/** One stored result/reference; the shape `arenaRecord` validates. */
export const arenaMedia = z.strictObject({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(["image", "video"]),
  label: z.string().max(100),
  contentType: z.enum(["video/mp4", "image/png", "image/jpeg", "image/webp"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration: z.number().nonnegative().finite(),
  bytes: z.number().int().positive().max(ARENA_MAX_BYTES),
});
/**
 * A whole stored comparison, as `GET /api/arena` and the index return it: the
 * draft plus the id, revision, timestamp and media the UI immediately renders
 * (`Arena.tsx` reads `draft.slots.map` and `arena.media.filter`). Validating
 * against this is what keeps one malformed row from blanking the studio; the
 * server's index reader and the browser list share it so they cannot disagree.
 */
export const arenaRecord = arenaDraft
  .safeExtend({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
    media: z.array(arenaMedia).max(24),
    runRequest: z
      .strictObject({
        slots: z
          .array(z.string().regex(/^[a-z0-9-]{1,40}$/))
          .min(1)
          .max(4),
        requestedAt: z.iso.datetime(),
      })
      .optional(),
  })
  .superRefine((a, ctx) => {
    const hashes = new Set(a.media.map((m) => m.hash));
    if (
      hashes.size !== a.media.length ||
      a.media.reduce((n, m) => n + m.bytes, 0) > 256 * 1024 * 1024 ||
      a.slots.some((s) => s.media && !a.media.some((m) => m.hash === s.media))
    )
      ctx.addIssue({ code: "custom", message: "Invalid stored media." });
  });
export interface ArenaMedia {
  hash: string;
  kind: "image" | "video";
  label: string;
  contentType: string;
  width: number;
  height: number;
  duration: number;
  bytes: number;
}
export interface Arena extends ArenaDraft {
  id: string;
  revision: number;
  updatedAt: string;
  media: ArenaMedia[];
  /** An agent asked the person to run these approaches; it cannot spend. */
  runRequest?: { slots: string[]; requestedAt: string };
}
export function newArena(): ArenaDraft {
  return {
    title: "Untitled comparison",
    prompt: "",
    notes: "",
    slots: ["rgb", "canny", "depth"].map((id) => ({
      id,
      label: id === "rgb" ? "RGB" : id === "canny" ? "Canny" : "Depth",
      model: "",
      workflow: "",
      guide: id,
      prompt: "",
      notes: "",
      status: "draft",
    })),
  };
}
export function draftOf({
  title,
  prompt,
  notes,
  slots,
  preferred,
  sourceSeconds,
  settings,
}: Arena): ArenaDraft {
  return {
    title,
    prompt,
    notes,
    slots,
    ...(preferred ? { preferred } : {}),
    ...(sourceSeconds ? { sourceSeconds } : {}),
    ...(settings ? { settings } : {}),
  };
}
export const arenaMediaUrl = (id: string, hash: string) =>
  `/api/arena/${id}/files/${hash}`;
