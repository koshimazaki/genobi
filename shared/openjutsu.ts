import { h3Files, isH3 } from "./h3";
import { imageReference } from "./image";
import type { GenerateInput, SwapSettings } from "./types";
import type { WorkflowFile } from "./comfy/workflow";
import { isSeedvr2, seedvr2Files } from "./comfy/seedvr2";

/**
 * Comfy's Openjutsu character swap (Comfy-Org/comfy-openjutsu, MIT, at
 * 70ec62d): one clip, one character image and an optional first frame go
 * into MiniMax H3 with Akatz Labs' swap LoRA, and the part comes back with
 * the character in it, the clip's own sound kept. Genobi runs the graph on
 * a Comfy deployment built for it (`shared/comfy/openjutsu.ts`) and
 * makes the first frame with a FLUX 3 Image Klein box edit
 * (`shared/openjutsu-anchor.ts`) instead of GPT Image. See
 * docs/openjutsu-swap.md.
 */
export const SWAP_MODEL = "openjutsu-swap";
export const isSwap = (model: unknown) => model === SWAP_MODEL;

/** Openjutsu's limits: a 5 to 15 second part, two sizes, a uint32 seed. */
export const SWAP_MIN_SECONDS = 5;
export const SWAP_MAX_SECONDS = 15;
export const SWAP_SIZES = [480, 768] as const;
export const MAX_SWAP_SEED = 2 ** 32 - 1;
export const MAX_SWAP_DIRECTION = 500;
/** How many items a first frame may change, and how long each name is. */
export const MAX_SWAP_ITEMS = 8;
export const MAX_ITEM_NAME = 40;
const ITEM = /^[\p{L}\p{N}][\p{L}\p{N} '’-]{0,39}$/u;
export const isItemName = (value: unknown): value is string =>
  typeof value === "string" && ITEM.test(value) && value.trim() === value;

/** Runs that read a clip the session owns: an upscale, H3 and the swap. */
export const readsSourceClip = (
  input: Pick<GenerateInput, "generator" | "model">,
) => input.generator === "upscale" || isH3(input.model) || isSwap(input.model);

const named = (items: readonly string[]) => {
  const list = items.map((item) => `the ${item}`);
  return list.length < 2
    ? list.join("")
    : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
};

/**
 * The swap's prompt: the workflow's own instruction with H3's reference tags
 * (as Openjutsu writes it), the first frame when there is one, the items when
 * the first frame changed items rather than the whole person, then the
 * person's own direction.
 */
export function swapPrompt(
  direction: string,
  withAnchor: boolean,
  items: readonly string[] = [],
): string {
  return [
    "Replace the selected person in <Video 1> with the character in <Picture 1>.",
    "Preserve the source performance, scene and audio timing.",
    withAnchor ? "Start from the first frame in <Picture 2>." : "",
    items.length
      ? `Change only ${named(items)} on the person; keep their face, hair and the rest of their look from <Video 1>.`
      : "",
    direction.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

/** Openjutsu draws a fresh seed when none is given; a request must name one. */
export const randomSwapSeed = () =>
  crypto.getRandomValues(new Uint32Array(1))[0];

/**
 * The swap's input files, after ownership checks and the durable reservation:
 * the clip, the character (reference 1) and the first frame (reference 2)
 * when there is one. Never a URL a visitor sent.
 */
export function swapFiles(
  input: GenerateInput,
  video: Uint8Array,
): Record<string, WorkflowFile> {
  const refs = input.imageReferences ?? [];
  if (refs.length < 1 || refs.length > 2 || !video.length)
    throw new Error("The swap needs a clip, a character and at most a frame.");
  const image = (ref: string): WorkflowFile => {
    const { bytes, metadata } = imageReference(ref);
    return {
      bytes,
      contentType: metadata.contentType as WorkflowFile["contentType"],
    };
  };
  return {
    clip: { bytes: video, contentType: "video/mp4" },
    character: image(refs[0]),
    ...(refs[1] ? { anchor: image(refs[1]) } : {}),
  };
}

/**
 * A clip-reading workflow's files: H3's three, the swap's two or three, or
 * SeedVR2's one.
 */
export function clipFiles(
  input: GenerateInput,
  requestInput: GenerateInput,
  video: Uint8Array,
): Record<string, WorkflowFile> | undefined {
  if (isH3(input.model)) return h3Files(requestInput, video);
  if (isSwap(input.model)) return swapFiles(requestInput, video);
  if (isSeedvr2(input.model)) return seedvr2Files(video);
  return undefined;
}

/** The settings a valid swap request carries, for code that holds one. */
export const swapSettings = (input: GenerateInput): SwapSettings | undefined =>
  isSwap(input.model) ? input.swap : undefined;
