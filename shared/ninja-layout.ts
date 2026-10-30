/**
 * The Ninja arrangement: which panels show, in what order and at what size.
 * Portable so the studio, the local server and an imported file read it with
 * one rule. A layout is UI preferences only: it never carries the project,
 * prompts, media or a connection.
 */

/** Every studio panel. `src/studio/presets.ts` checks its titles against this list. */
export const PANEL_IDS = [
  "preview",
  "composer",
  "gallery",
  "prompt",
  "inputs",
  "stage",
  "templates",
  "timeline",
  "tools",
  "project",
  "inspirations",
  "file",
  "world",
  "plates",
  "plateView",
  "dual",
  "scrolls",
] as const;
export type LayoutPanelId = (typeof PANEL_IDS)[number];

export const MAX_LAYOUT_BYTES = 8192;

export interface NinjaPanel {
  id: LayoutPanelId;
  width: "half" | "full";
  columns?: number;
  height?: number;
  fit?: "contain" | "cover";
}
export interface NinjaLayout {
  format: "genobi.ninja-layout";
  version: 3;
  panels: NinjaPanel[];
  compact?: boolean;
}

const isPanelId = (id: unknown): id is LayoutPanelId =>
  typeof id === "string" && (PANEL_IDS as readonly string[]).includes(id);

const isWhole = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

/** Bytes of a string as UTF-8, without depending on a platform encoder. */
export function utf8Bytes(text: string) {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function parsePanel(entry: unknown, seen: Set<string>): NinjaPanel {
  if (!entry || typeof entry !== "object" || Array.isArray(entry))
    throw new Error("Invalid layout panel.");
  const { id, width, columns, height, fit } = entry as Record<string, unknown>;
  if (
    !isPanelId(id) ||
    seen.has(id) ||
    (width !== "half" && width !== "full") ||
    (columns !== undefined && !isWhole(columns, 4, 12)) ||
    (height !== undefined && !isWhole(height, 200, 1600)) ||
    (fit !== undefined && fit !== "contain" && fit !== "cover") ||
    Object.keys(entry).some(
      (k) => !["id", "width", "columns", "height", "fit"].includes(k),
    )
  )
    throw new Error("Layout has an unknown, duplicate or invalid panel.");
  seen.add(id);
  return {
    id,
    width,
    ...(columns !== undefined ? { columns: columns as number } : {}),
    ...(height !== undefined ? { height: height as number } : {}),
    ...(fit !== undefined ? { fit: fit as "contain" | "cover" } : {}),
  };
}

/** Puts `id` after `after` with its width, as the panel it was split from. */
function splitAfter(
  entries: NinjaPanel[],
  after: LayoutPanelId,
  id: LayoutPanelId,
) {
  const index = entries.findIndex((p) => p.id === after);
  const { width, columns } = entries[index];
  entries.splice(index + 1, 0, { id, width, ...(columns ? { columns } : {}) });
}

/**
 * A parsed layout value, any version from 1 to 3, as version 3. Throws on
 * anything else, including unknown fields, so nothing extra rides along.
 */
export function parseNinjaLayout(value: unknown): NinjaLayout {
  const layout = value as Record<string, unknown> | null;
  if (
    !layout ||
    typeof layout !== "object" ||
    Array.isArray(layout) ||
    layout.format !== "genobi.ninja-layout" ||
    ![1, 2, 3].includes(layout.version as number) ||
    !Array.isArray(layout.panels) ||
    layout.panels.length > PANEL_IDS.length ||
    (layout.compact !== undefined && typeof layout.compact !== "boolean") ||
    Object.keys(layout).some(
      (k) => !["format", "version", "panels", "compact"].includes(k),
    )
  )
    throw new Error("This file is not a supported Ninja layout.");
  const seen = new Set<string>();
  const entries = (layout.panels as unknown[]).map((entry) =>
    parsePanel(entry, seen),
  );
  // V1 embedded the animation prompt inside Inputs. Keep it visible when splitting.
  if (layout.version === 1 && seen.has("inputs") && !seen.has("prompt"))
    splitAfter(entries, "inputs", "prompt");
  if (
    (layout.version as number) < 3 &&
    seen.has("project") &&
    !seen.has("inspirations")
  )
    splitAfter(entries, "project", "inspirations");
  return {
    format: "genobi.ninja-layout",
    version: 3,
    panels: entries.filter((p) => p.id !== "inputs"),
    ...(layout.compact !== undefined
      ? { compact: layout.compact as boolean }
      : {}),
  };
}

/** A layout file or stored text: bounded, then parsed as `parseNinjaLayout`. */
export function parseLayoutText(text: string): NinjaLayout {
  if (utf8Bytes(text) > MAX_LAYOUT_BYTES)
    throw new Error("Layout files must be under 8 KB.");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Choose a valid Ninja layout JSON file.");
  }
  return parseNinjaLayout(value);
}
