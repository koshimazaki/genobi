/**
 * The nested records a project's generation settings may carry, read from an
 * untrusted bundle with the same rules the composer and server hold them to.
 * Each reader returns the rebuilt record, or undefined so the field is
 * dropped and `recreate-gaps.ts` names it, rather than letting a malformed
 * value reach Camera's restore (`ltxPrompt: { main: 42 }` crashed it).
 * Portable: no framework, Node or DOM APIs.
 */
import { readAcoustic } from "../acoustic";
import {
  cameraSections,
  type CameraEdits,
  type CameraSelection,
} from "../camera";
import { readLtxPrompt } from "../ltx-prompt";
import {
  isItemName,
  MAX_SWAP_ITEMS,
  MAX_SWAP_SEED,
  SWAP_SIZES,
} from "../openjutsu";
import type { GenerateInput, SwapSettings } from "../types";

const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** One term per camera section, each known or null (as `validateCamera`). */
export function readCameraSelection(
  value: unknown,
): CameraSelection | undefined {
  if (!plain(value)) return undefined;
  if (Object.keys(value).some((k) => !cameraSections.some((s) => s.id === k)))
    return undefined;
  const camera: Record<string, string | null> = {};
  for (const section of cameraSections) {
    const term = value[section.id] ?? null;
    if (term !== null && !section.terms.some((t) => t.id === term))
      return undefined;
    camera[section.id] = term as string | null;
  }
  return camera as CameraSelection;
}

/** Phrases for the selected terms only, each a string of at most 600. */
export function readCameraEdits(
  value: unknown,
  camera: CameraSelection | undefined,
): CameraEdits | undefined {
  if (!plain(value) || !camera) return undefined;
  const selected = new Set<string | null>(Object.values(camera));
  const edits: Record<string, string> = {};
  for (const [id, text] of Object.entries(value)) {
    if (!selected.has(id) || typeof text !== "string" || text.length > 600)
      return undefined;
    edits[id] = text;
  }
  return edits as CameraEdits;
}

/** The swap's part, size, seed and items, within Openjutsu's limits. */
export function readSwapSettings(value: unknown): SwapSettings | undefined {
  if (!plain(value)) return undefined;
  const start = value.start ?? 0;
  const items = value.items ?? [];
  if (
    typeof start !== "number" ||
    !Number.isFinite(start) ||
    start < 0 ||
    start > 3600 ||
    !SWAP_SIZES.includes(value.size as never) ||
    !Number.isInteger(value.seed) ||
    (value.seed as number) < 0 ||
    (value.seed as number) > MAX_SWAP_SEED ||
    !Array.isArray(items) ||
    items.length > MAX_SWAP_ITEMS ||
    !items.every(isItemName) ||
    new Set(items).size !== items.length
  )
    return undefined;
  return {
    start,
    size: value.size as SwapSettings["size"],
    seed: value.seed as number,
    ...(items.length ? { items: items as string[] } : {}),
  };
}

/** The nested fields of a record that read cleanly; malformed ones left out. */
export function readNestedSettings(
  value: Record<string, unknown>,
): Partial<GenerateInput> {
  const out: Partial<GenerateInput> = {};
  const camera = readCameraSelection(value.camera);
  if (camera) out.camera = camera;
  const edits = readCameraEdits(value.cameraEdits, camera);
  if (edits) out.cameraEdits = edits;
  const ltx = readLtxPrompt(value.ltxPrompt);
  if (ltx) out.ltxPrompt = ltx;
  if (value.acoustic === null) out.acoustic = null;
  else {
    const acoustic = readAcoustic(value.acoustic);
    if (acoustic) out.acoustic = acoustic;
  }
  const swap = readSwapSettings(value.swap);
  if (swap) out.swap = swap;
  return out;
}
