import {
  genmodFrames,
  type GenModKeep,
  type GenModKind,
  type GenModRecipe,
} from "./recipe";

/**
 * What a Gen-Mod recipe asks of each pass, in the words and numbers both the
 * Director and an agent use. The video pass opens on the approved frame 0 and
 * follows the source's motion; the LTX graphs take one full-scene prompt.
 */

/**
 * The Klein frame 0 instruction for the swaps the Director's panel offers;
 * image 1 is the source frame, image 2 the reference. An `edit` is written by
 * the person in the Edit tool, with boxes, so it has no fixed instruction.
 */
export const GENMOD_STILL_INSTRUCTION = {
  character:
    "Replace the character inside the target region with the character from image 2. Preserve the scene, camera, lighting and pose.",
  face: "Replace only the face and hair inside the target region with the face and hair from image 2. Preserve the body, clothing, pose, expression direction, framing, lighting and background.",
  background:
    "Keep the person from image 1 exactly: identity, face, hair, clothing, pose, proportions, position and framing. Replace the background around them with the place from image 2, and match its light on the person.",
} as const satisfies Partial<Record<GenModKind, string>>;

const KEEP_SENTENCE: Record<GenModKeep, string> = {
  camera:
    "The camera position, lens and every camera movement stay exactly as in the source video.",
  framing:
    "The framing, and the subject's size and position in the frame, stay the same.",
  performance:
    "Every movement, gesture and head turn keeps its original timing.",
  light: "The lighting, its direction and its colour stay the same.",
  background: "",
  wardrobe: "The clothing stays the same.",
};
const sentence = (s: string) => {
  const t = s.trim().replace(/[.!]+$/, "");
  return t && t[0].toUpperCase() + t.slice(1);
};

/** The full-scene prompt for the video pass: the action, the change, then what is kept. */
export function genmodPrompt(recipe: GenModRecipe): string {
  const change = `${sentence(recipe.change)}${recipe.firstFrame ? ", as in the first frame" : ""}.`;
  const keep = recipe.keep.map((k) =>
    k !== "background"
      ? KEEP_SENTENCE[k]
      : recipe.route === "masked"
        ? "Everything outside the marked region stays unchanged."
        : "The background stays as the first frame shows it.",
  );
  return [recipe.action, change, ...keep].filter(Boolean).join(" ");
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A masked-route region in pixels on a `width` × `height` frame, grown by the
 * dilation and clamped to the frame: the white rectangle of a static mask
 * video (white regenerates, black keeps).
 */
export function genmodMaskRect(
  mask: NonNullable<GenModRecipe["mask"]>,
  width: number,
  height: number,
): PixelRect {
  if (!Number.isInteger(width) || !Number.isInteger(height))
    throw new Error("Frame size must be whole pixels");
  if (width < 1 || height < 1) throw new Error("Frame size must be positive");
  const [top, left, bottom, right] = mask.region;
  const d = mask.dilation;
  const x0 = Math.max(0, Math.floor((left / 1000) * width) - d);
  const y0 = Math.max(0, Math.floor((top / 1000) * height) - d);
  const x1 = Math.min(width, Math.ceil((right / 1000) * width) + d);
  const y1 = Math.min(height, Math.ceil((bottom / 1000) * height) + d);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * What one Gen-Mod video pass needs, before anything is uploaded: the frames
 * to cut from the source, the route's guide or mask, the prompt and the
 * soundtrack choice. Refuses a recipe without an approved first frame: the
 * still is the cheap check that comes before any video spend.
 */
export function genmodVideoPass(
  recipe: GenModRecipe,
  frame: { width: number; height: number },
) {
  if (!recipe.firstFrame)
    throw new Error("Approve an edited first frame before the video pass");
  const frames = genmodFrames(recipe.source);
  return {
    cut: { in: recipe.source.in, out: recipe.source.in + frames },
    frames,
    frame: { width: frame.width, height: frame.height },
    firstFrame: recipe.firstFrame.assetId,
    prompt: genmodPrompt(recipe),
    audio: recipe.audio,
    ...(recipe.route === "masked"
      ? {
          route: "masked" as const,
          mask: genmodMaskRect(recipe.mask!, frame.width, frame.height),
        }
      : recipe.route === "control"
        ? { route: "control" as const, control: recipe.control! }
        : { route: "audio" as const }),
  };
}
