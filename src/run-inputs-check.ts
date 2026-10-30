import { GRID, MAX_LAYOUT_ROWS } from "../shared/image-layout";
import {
  IMAGE_DESCRIPTION_LIMIT,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_REFERENCES,
} from "../shared/image";
import type { Box, ImageRegion } from "./image-regions";
import type { RunInputs } from "./run-inputs";

/**
 * Browser storage is outside the app's control: another tab, an extension or
 * a corrupted profile can leave any shape there. A stored row reaches the
 * composer only when every field has the shape `captureRunInputs` writes;
 * anything else is discarded whole, so Recreate asks for reattachment.
 */
const REFERENCE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
/** A 5 MB file in base64, plus its `data:` prefix. */
const MAX_REFERENCE_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32;
/** The tray's own combined ceiling (`src/useImageReferences.ts`). */
const MAX_REFERENCES_CHARS = 14 * 1024 * 1024;
/** The layout row id BFL accepts (`shared/image-layout.ts`). */
const REGION_ID = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_REGION_DESCRIPTION = 2000;
const ACTIONS = new Set(["change", "keep", "move", "remove"]);
const CONTROL = /[\x00-\x1f\x7f]/g; // eslint-disable-line no-control-regex

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length <= limit;
const isGridNumber = (value: unknown) =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) <= GRID;

function box(value: unknown): Box | undefined {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(isGridNumber))
    return;
  const [top, left, bottom, right] = value as Box;
  return top < bottom && left < right ? [top, left, bottom, right] : undefined;
}

function region(value: unknown, references: number): ImageRegion | undefined {
  if (!isRecord(value)) return;
  const { id, action, description, referenceIndex, label, target } = value;
  const area = box(value.box);
  if (
    typeof id !== "string" ||
    !REGION_ID.test(id) ||
    !area ||
    typeof action !== "string" ||
    !ACTIONS.has(action) ||
    !isText(description, MAX_REGION_DESCRIPTION)
  )
    return;
  const result: ImageRegion = {
    id,
    box: area,
    action: action as ImageRegion["action"],
    description: description.replace(CONTROL, " "),
  };
  if (target !== undefined) {
    const moved = box(target);
    if (!moved) return;
    result.target = moved;
  }
  if (referenceIndex !== undefined) {
    if (
      !Number.isInteger(referenceIndex) ||
      (referenceIndex as number) < 0 ||
      (referenceIndex as number) >= references
    )
      return;
    result.referenceIndex = referenceIndex as number;
  }
  if (label !== undefined) {
    if (
      !Array.isArray(label) ||
      label.length !== 2 ||
      !label.every((n) => typeof n === "number" && Number.isFinite(n))
    )
      return;
    result.label = [label[0], label[1]];
  }
  return result;
}

/** A stored row with the shape Recreate restores, or undefined. */
export function checkRunInputs(value: unknown): RunInputs | undefined {
  if (!isRecord(value)) return;
  const { id, savedAt, bytes, generator, model, description } = value;
  const { sentDescription, imageReferences, imageRegions } = value;
  if (
    !isText(id, 200) ||
    !id ||
    typeof savedAt !== "number" ||
    !Number.isFinite(savedAt) ||
    typeof bytes !== "number" ||
    !Number.isFinite(bytes) ||
    bytes < 0 ||
    !isText(generator, 40) ||
    (model !== undefined && !isText(model, 80)) ||
    !isText(description, IMAGE_DESCRIPTION_LIMIT) ||
    !isText(sentDescription, IMAGE_DESCRIPTION_LIMIT) ||
    !Array.isArray(imageReferences) ||
    imageReferences.length > MAX_IMAGE_REFERENCES ||
    !Array.isArray(imageRegions) ||
    imageRegions.length > MAX_LAYOUT_ROWS
  )
    return;
  let total = 0;
  for (const reference of imageReferences) {
    if (
      !isText(reference, MAX_REFERENCE_CHARS) ||
      !REFERENCE.test(reference) ||
      (total += reference.length) > MAX_REFERENCES_CHARS
    )
      return;
  }
  const regions = imageRegions.map((r) => region(r, imageReferences.length));
  if (regions.some((r) => !r)) return;
  return {
    id,
    savedAt,
    bytes,
    generator: generator as RunInputs["generator"],
    model: model as RunInputs["model"],
    description,
    sentDescription,
    imageReferences: [...(imageReferences as string[])],
    imageRegions: regions as ImageRegion[],
  };
}
