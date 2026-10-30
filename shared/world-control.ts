import { z } from "zod";
import { CHARACTER_POSES } from "./scene/characters";
export const worldControl = z.strictObject({
  move: z
    .tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)])
    .optional(),
  running: z.boolean().optional(),
  action: z.enum(CHARACTER_POSES).optional(),
  character: z.enum(["mannequin", "pug", "creature", "blob"]).optional(),
  camera: z.enum(["follow", "orbit", "shot"]).optional(),
  seconds: z.number().min(0.1).max(10).default(1),
});
export type WorldControl = z.infer<typeof worldControl>;
/** A recipe's JSON bound, as `validateRecipe` holds it. */
export const RECIPE_BYTES = 64_000;
/** A take's name: it becomes the take's file names, so no path characters. */
export const WORLD_TAKE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** The files a paired session may hold: a live clip, or a fixed take's passes. */
export const WORLD_FILES = {
  "clip.webm": "video/webm",
  "first.png": "image/png",
  "receipt.json": "application/json",
  "depth.webm": "video/webm",
  "depth-first.png": "image/png",
  "audio.wav": "audio/wav",
} as const;
export type WorldFile = keyof typeof WORLD_FILES;
export const worldCommand = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("status") }),
  z.strictObject({ op: z.literal("control"), input: worldControl }),
  z.strictObject({ op: z.literal("record-start") }),
  z.strictObject({ op: z.literal("record-stop") }),
  z.strictObject({ op: z.literal("stop") }),
  // The scene library: preset names, load one by name, and this browser's
  // takes. Loading changes the recipe; nothing is uploaded or generated.
  z.strictObject({ op: z.literal("presets") }),
  z.strictObject({
    op: z.literal("load-preset"),
    name: z.string().min(1).max(40),
  }),
  z.strictObject({ op: z.literal("takes") }),
  // The current recipe, as getRecipe returns it (at most 64 KB of JSON).
  z.strictObject({ op: z.literal("recipe") }),
  // Send to Director for one library take, by its id or name (the newest
  // of that name): the first frame under Inspirations and the take as MP4
  // (with its WAV) under Project of the tab's open project. Free.
  z.strictObject({
    op: z.literal("send-to-project"),
    take: z.string().min(1).max(80),
  }),
  // The Capture button's fixed-frame take, named, kept in the Takes library
  // and held on the local server for this session's download. Free.
  z.strictObject({
    op: z.literal("capture"),
    name: z.string().regex(WORLD_TAKE_NAME),
  }),
]);
export type WorldCommand = z.infer<typeof worldCommand>;
