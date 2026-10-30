/**
 * The layout rows a FLUX image prompt ends with, read back on the server.
 *
 * BFL writes boxes into `prompt` itself: a caption, then a JSON array of rows
 * (docs.bfl.ai/flux_3/flux3_image_bounding_boxes, checked 21 October 2026).
 * Every box is `[top, left, bottom, right]` in integers from 0 to 1000 measured
 * from the top-left corner, whatever the frame's size. A generated row has
 * `bbox`; an edit row has `from`, `src_bbox` and `tgt_bbox`, where `from` is
 * `null` or `ref_image_N` and either box may be `null`. Boxes guide placement;
 * they are prompt coordinates, never masks.
 *
 * The studio builds the rows in one place, `src/image-regions.ts`. This module
 * only reads them, so both adapters refuse a box outside the frame, inverted,
 * or naming a reference the request does not carry, and so the open Klein
 * graph can keep the rows apart from the caption its upsampler rewrites.
 */
export type LayoutBox = [number, number, number, number];
export interface LayoutRow {
  id: string;
  desc: string;
  bbox?: LayoutBox;
  from?: string | null;
  src_bbox?: LayoutBox | null;
  tgt_bbox?: LayoutBox | null;
}
export interface Layout {
  /** The text before the rows, trimmed. */
  caption: string;
  /** The rows as written, or null when the prompt carries none. */
  rows: LayoutRow[] | null;
  /** The rows' JSON exactly as it stood in the prompt; empty without rows. */
  json: string;
}

export const GRID = 1000;
export const MAX_LAYOUT_ROWS = 32;
const ID = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const REF = /^ref_image_(\d)$/;
const MAX_DESC = 2000;
/** How many openings, from the end, are tried before the prompt is read as text. */
const MAX_ATTEMPTS = 64;
/** An array of objects opening: `[`, any whitespace, `{` (pretty-printed JSON too). */
const OPENING = /\[\s*\{/g;

export class LayoutError extends Error {}

const isRowLike = (value: unknown) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  ["bbox", "src_bbox", "tgt_bbox"].some((key) => key in (value as object));

/**
 * The trailing JSON array of a prompt, when it is an array of layout rows.
 * An array that is not rows (numbers, words, objects without a box) is left
 * as text: only a prompt that claims a layout is held to one.
 */
function trailingRows(
  prompt: string,
): { start: number; value: unknown[] } | null {
  const text = prompt.trimEnd();
  if (!text.endsWith("]")) return null;
  // From the last opening back: prose before the rows cannot use up the
  // attempts, and a slice starting inside a row's text does not parse.
  const openings = [...text.matchAll(OPENING)].map((m) => m.index);
  for (const start of openings.reverse().slice(0, MAX_ATTEMPTS)) {
    try {
      const value: unknown = JSON.parse(text.slice(start));
      if (Array.isArray(value) && value.length && value.every(isRowLike))
        return { start, value };
    } catch {
      // Not the opening of the trailing array; try the next one.
    }
  }
  return null;
}

function box(value: unknown, where: string): LayoutBox {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((n) => Number.isInteger(n) && n >= 0 && n <= GRID)
  )
    throw new LayoutError(
      `${where} must be four whole numbers from 0 to ${GRID}: top, left, bottom, right.`,
    );
  const [top, left, bottom, right] = value as LayoutBox;
  if (top >= bottom || left >= right)
    throw new LayoutError(
      `${where} must have its bottom below its top and its right past its left.`,
    );
  return [top, left, bottom, right];
}

function nullableBox(value: unknown, where: string) {
  return value === null ? null : box(value, where);
}

/**
 * Splits a prompt into caption and rows and checks every row. `references`
 * is how many images the request carries, so a row can only name one it has.
 * Throws `LayoutError` with a sentence for the person; never returns a box it
 * did not check.
 */
export function readLayout(prompt: string, references = 0): Layout {
  const found = trailingRows(prompt);
  if (!found) return { caption: prompt.trim(), rows: null, json: "" };
  if (found.value.length > MAX_LAYOUT_ROWS)
    throw new LayoutError(`Use at most ${MAX_LAYOUT_ROWS} boxes.`);
  const ids = new Set<string>();
  const rows = found.value.map((raw, index): LayoutRow => {
    const row = raw as Record<string, unknown>;
    const where = `Box ${index + 1}`;
    if (typeof row.id !== "string" || !ID.test(row.id) || ids.has(row.id))
      throw new LayoutError(
        `${where} needs its own id of letters, digits and underscores.`,
      );
    ids.add(row.id);
    if (typeof row.desc !== "string" || row.desc.length > MAX_DESC)
      throw new LayoutError(
        `${where} needs a description under ${MAX_DESC} characters.`,
      );
    if ("bbox" in row)
      return { id: row.id, desc: row.desc, bbox: box(row.bbox, where) };
    const from = row.from;
    if (from !== null && from !== undefined) {
      const match = typeof from === "string" ? REF.exec(from) : null;
      if (!match || Number(match[1]) >= references)
        throw new LayoutError(
          `${where} names a reference image this request does not carry.`,
        );
    }
    if (row.src_bbox == null && row.tgt_bbox == null)
      throw new LayoutError(
        `${where} needs a source box, a target box or both.`,
      );
    return {
      id: row.id,
      desc: row.desc,
      from: (from as string | null | undefined) ?? null,
      src_bbox: nullableBox(row.src_bbox ?? null, `${where}'s source`),
      tgt_bbox: nullableBox(row.tgt_bbox ?? null, `${where}'s target`),
    };
  });
  const text = prompt.trimEnd();
  return {
    caption: text.slice(0, found.start).trim(),
    rows,
    json: text.slice(found.start),
  };
}
