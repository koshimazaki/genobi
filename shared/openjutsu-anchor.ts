import { GRID, type LayoutBox } from "./image-layout";
import { isItemName, MAX_SWAP_ITEMS } from "./openjutsu";

/**
 * The swap's first frame, made by a FLUX 3 Image Klein box edit where
 * Openjutsu asks GPT Image 2.5 (`lib/anchor.ts`). The frame at the part's
 * start is image 1; each box says what goes where on it, the whole person or
 * one item (a hat, a shirt, a held object), with its own reference image.
 * The request is an ordinary Klein API image run with references
 * (`flux-3-klein-api`, BFL key), quoted and submitted like any other: this
 * module only writes it. Its rows are the edit rows `src/image-regions.ts`
 * writes (`from`, `src_bbox`, `tgt_bbox` on BFL's 0–1000 grid), which both
 * adapters read back and check (`shared/image-layout.ts`).
 */
export interface AnchorBox {
  /** `[top, left, bottom, right]` on the frame, 0–1000. */
  box: LayoutBox;
  /** `person` for the whole person, or the one item the box changes. */
  target: string;
  /** The reference image for this box, 0-based in `references`. */
  reference: number;
}

export interface AnchorInput {
  /** The frame at the part's start, as a data URL. */
  frame: string;
  /** The character and item images, as data URLs; at most nine. */
  references: string[];
  boxes: AnchorBox[];
  /** Klein's tier; the frame decides the ratio (`auto`). */
  resolution?: "768sq" | "1k" | "1.5k" | "2k";
}

const MAX_BOXES = MAX_SWAP_ITEMS;
const MAX_REFERENCES = 9;

/** Openjutsu's own first-frame instruction, for the whole person. */
const personSentence = (image: number) =>
  `Replace the person in image 1 with the character from image ${image}, including their face, hair, body and complete outfit exactly as shown in image ${image}. Do not keep any of the original person's clothing.`;
const itemSentence = (item: string, image: number) =>
  `replace the ${item} with the one in image ${image}`;

function checkBox(entry: AnchorBox, index: number, references: number) {
  const where = `Box ${index + 1}`;
  const [top, left, bottom, right] = entry.box ?? [];
  if (
    ![top, left, bottom, right].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= GRID,
    ) ||
    top >= bottom ||
    left >= right
  )
    throw new Error(
      `${where} must be top, left, bottom, right from 0 to ${GRID}, bottom below top and right past left.`,
    );
  if (
    !Number.isInteger(entry.reference) ||
    entry.reference < 0 ||
    entry.reference >= references
  )
    throw new Error(`${where} names a reference image that is not given.`);
  if (entry.target !== "person" && !isItemName(entry.target))
    throw new Error(`${where} needs "person" or a short item name.`);
}

/** The items the boxes change, when no box takes the whole person. */
export function anchorItems(boxes: readonly AnchorBox[]): string[] {
  if (boxes.some((b) => b.target === "person")) return [];
  return [...new Set(boxes.map((b) => b.target))];
}

/**
 * The prompt: the instruction (the whole person as Openjutsu words it, or
 * only the named items, keeping the rest), what to keep, then the rows.
 */
export function anchorPrompt(boxes: readonly AnchorBox[]): string {
  const image = (b: AnchorBox) => b.reference + 2;
  const person = boxes.find((b) => b.target === "person");
  const items = boxes.filter((b) => b.target !== "person");
  const sentences = [
    person ? personSentence(image(person)) : "",
    items.length
      ? `${person ? "Then, on the new character" : "On the person in image 1"}, ${items
          .map((b) => itemSentence(b.target, image(b)))
          .join(
            "; ",
          )}${person ? "" : ", and keep their face, hair and the rest of their outfit"}.`
      : "",
    "Keep image 1's pose, framing, background and lighting.",
  ].filter(Boolean);
  const rows = boxes.map((b, i) => ({
    id: `box_${i + 1}`,
    from: `ref_image_${b.reference + 1}`,
    src_bbox: [0, 0, GRID, GRID],
    tgt_bbox: b.box,
    desc:
      b.target === "person"
        ? `the character from image ${image(b)}, the whole person`
        : `the ${b.target} from image ${image(b)}`,
  }));
  return `${sentences.join(" ")}\n\n${JSON.stringify(rows)}`;
}

/**
 * The Klein API image request for the first frame, ready for
 * `POST /api/quotes` and `POST /api/jobs`: the frame first, then the
 * references, the rows in the prompt, the frame's own ratio.
 */
export function anchorRequest(input: AnchorInput) {
  if (!input.boxes.length || input.boxes.length > MAX_BOXES)
    throw new Error(`Draw one to ${MAX_BOXES} boxes on the first frame.`);
  if (!input.references.length || input.references.length > MAX_REFERENCES)
    throw new Error(
      `Give one to ${MAX_REFERENCES} reference images for the boxes.`,
    );
  input.boxes.forEach((b, i) => checkBox(b, i, input.references.length));
  return {
    generator: "image" as const,
    model: "flux-3-klein-api" as const,
    description: anchorPrompt(input.boxes),
    imageReferences: [input.frame, ...input.references],
    imageAspectRatio: "auto" as const,
    imageResolution: input.resolution ?? "1k",
    cameraEnabled: false,
  };
}
