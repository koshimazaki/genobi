import { imageReference, MAX_IMAGE_REQUEST_BYTES } from "../shared/image";
import {
  isItemName,
  MAX_SWAP_DIRECTION,
  MAX_SWAP_ITEMS,
  MAX_SWAP_SEED,
  SWAP_MAX_SECONDS,
  SWAP_MIN_SECONDS,
  SWAP_MODEL,
  SWAP_SIZES,
} from "../shared/openjutsu";
import type { GenerateInput, SwapSettings } from "../shared/types";
import { AppError } from "./errors";

const bad = (message: string) => new AppError(400, message);
/** The longest clip a part may start in: an hour, far past any upload. */
const MAX_START = 3600;

function readSettings(value: unknown): SwapSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw bad("The character swap needs its part, size and seed.");
  const swap = value as Record<string, unknown>;
  const start = swap.start ?? 0;
  if (
    typeof start !== "number" ||
    !Number.isFinite(start) ||
    start < 0 ||
    start > MAX_START
  )
    throw bad(
      "Choose where the part starts, in seconds from the clip's start.",
    );
  if (!SWAP_SIZES.includes(swap.size as never))
    throw bad("Choose 480 or 768 for the swap's size.");
  if (
    !Number.isInteger(swap.seed) ||
    (swap.seed as number) < 0 ||
    (swap.seed as number) > MAX_SWAP_SEED
  )
    throw bad(`Choose a whole-number seed from 0 to ${MAX_SWAP_SEED}.`);
  const items = swap.items ?? [];
  if (
    !Array.isArray(items) ||
    items.length > MAX_SWAP_ITEMS ||
    !items.every(isItemName) ||
    new Set(items).size !== items.length
  )
    throw bad(
      `Name at most ${MAX_SWAP_ITEMS} different items the first frame changed, each in a few words.`,
    );
  return {
    start: Math.round(start * 100) / 100,
    size: swap.size as SwapSettings["size"],
    seed: swap.seed as number,
    ...(items.length ? { items: items as string[] } : {}),
  };
}

/**
 * An Openjutsu swap request, held to Openjutsu's own limits (`lib/swap.ts`'s
 * `readSettings`): a 5 to 15 second part, 480 or 768, a uint32 seed, a
 * direction of at most 500 characters. References are the character, then
 * the first frame when there is one; the clip is a source the session owns.
 */
export function validateSwap(
  body: Record<string, unknown>,
  revision: { projectRevision?: number },
): GenerateInput {
  if (body.generator !== "video") throw bad("The character swap makes video.");
  const direction = body.description ?? "";
  if (typeof direction !== "string" || direction.length > MAX_SWAP_DIRECTION)
    throw bad(`Keep the direction under ${MAX_SWAP_DIRECTION} characters.`);
  const seconds = body.duration;
  if (
    !Number.isInteger(seconds) ||
    (seconds as number) < SWAP_MIN_SECONDS ||
    (seconds as number) > SWAP_MAX_SECONDS
  )
    throw bad(
      `Choose a part between ${SWAP_MIN_SECONDS} and ${SWAP_MAX_SECONDS} whole seconds long.`,
    );
  if (
    typeof body.sourceId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(body.sourceId)
  )
    throw bad("Choose the clip to swap the person in.");
  const refs = body.imageReferences;
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > 2)
    throw bad("The swap needs the character image, then a first frame if any.");
  let bytes = 0;
  try {
    for (const ref of refs) bytes += imageReference(ref).bytes.length;
  } catch (error) {
    throw bad((error as Error).message);
  }
  if (bytes > MAX_IMAGE_REQUEST_BYTES * 0.7)
    throw bad("Keep the character and first frame under 11 MB combined.");
  return {
    generator: "video",
    model: SWAP_MODEL,
    description: direction.trim(),
    cameraEnabled: false,
    duration: seconds as number,
    resolution: "hd",
    aspectRatio: "16:9",
    draft: false,
    sourceId: body.sourceId,
    imageReferences: refs as string[],
    swap: readSettings(body.swap),
    upscaleFactor: 2,
    upscaleCreativity: 0,
    ...revision,
  };
}
