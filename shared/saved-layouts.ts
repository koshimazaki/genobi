import {
  MAX_LAYOUT_BYTES,
  parseNinjaLayout,
  utf8Bytes,
  type NinjaLayout,
} from "./ninja-layout";

/**
 * Named layouts a person keeps and switches between. The local server keeps
 * them for the machine (`server/layouts.ts`); a hosted visitor keeps them in
 * the browser and moves them between devices as a file. Both read them here.
 */

/** The workspaces with an Assets rail; Ninja has none. */
export const RAIL_PRESETS = [
  "gallery",
  "camera",
  "director",
  "editor",
  "world",
  "dual",
  "scrolls",
  "tools",
] as const;
export type RailPreset = (typeof RAIL_PRESETS)[number];
/** Which workspaces the person opened or closed the Assets rail in. */
export type RailChoices = Partial<Record<RailPreset, boolean>>;

export interface SavedLayout {
  id: string;
  name: string;
  layout: NinjaLayout;
  rails: RailChoices;
  updatedAt: string;
}

export const MAX_SAVED_LAYOUTS = 20;
export const MAX_LAYOUT_NAME = 48;
/** One saved layout as JSON: the arrangement's own bound plus its name and rails. */
export const MAX_SAVED_LAYOUT_BYTES = MAX_LAYOUT_BYTES + 1024;
/** A whole export file, or the local server's file. */
export const MAX_LAYOUTS_FILE_BYTES =
  MAX_SAVED_LAYOUTS * MAX_SAVED_LAYOUT_BYTES;
export const LAYOUT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const LAYOUTS_FORMAT = "genobi.layouts";

export type LayoutRefusal = "invalid" | "full" | "name_taken" | "missing";
export class LayoutError extends Error {
  constructor(
    message: string,
    readonly code: LayoutRefusal = "invalid",
  ) {
    super(message);
  }
}

/** A name with control characters removed and whitespace collapsed. */
export function layoutName(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_LAYOUT_NAME * 4)
    throw new LayoutError(
      `Name a layout in up to ${MAX_LAYOUT_NAME} characters.`,
    );
  const name = value
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || [...name].length > MAX_LAYOUT_NAME)
    throw new LayoutError(
      `Name a layout in up to ${MAX_LAYOUT_NAME} characters.`,
    );
  return name;
}

export function layoutId(value: unknown): string {
  if (typeof value !== "string" || !LAYOUT_ID.test(value))
    throw new LayoutError("That layout id is not valid.");
  return value;
}

export function parseRails(value: unknown): RailChoices {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new LayoutError("Rail choices must be an object.");
  const rails: RailChoices = {};
  for (const [key, open] of Object.entries(value)) {
    if (
      !(RAIL_PRESETS as readonly string[]).includes(key) ||
      typeof open !== "boolean"
    )
      throw new LayoutError("Rail choices name a workspace and true or false.");
    rails[key as RailPreset] = open;
  }
  return rails;
}

/** What a save sends: a name, an arrangement and the rail choices. */
export function parseLayoutInput(
  id: unknown,
  body: unknown,
  updatedAt: string,
): SavedLayout {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new LayoutError("Send a JSON object.");
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some((k) => !["name", "layout", "rails"].includes(k)))
    throw new LayoutError(
      "A saved layout holds a name, layout and rails only.",
    );
  let layout: NinjaLayout;
  try {
    layout = parseNinjaLayout(fields.layout);
  } catch (error) {
    throw new LayoutError((error as Error).message);
  }
  const saved = {
    id: layoutId(id),
    name: layoutName(fields.name),
    layout,
    rails: parseRails(fields.rails),
    updatedAt,
  };
  if (utf8Bytes(JSON.stringify(saved)) > MAX_SAVED_LAYOUT_BYTES)
    throw new LayoutError("That layout is too large to save.");
  return saved;
}

/** A stored entry, or undefined when it is corrupt or from an unknown shape. */
function readEntry(value: unknown): SavedLayout | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const { id, updatedAt, ...rest } = value as Record<string, unknown>;
  try {
    return parseLayoutInput(
      id,
      rest,
      typeof updatedAt === "string" && updatedAt.length <= 40 ? updatedAt : "",
    );
  } catch {
    return undefined;
  }
}

const sameName = (a: string, b: string) =>
  a.toLocaleLowerCase() === b.toLocaleLowerCase();

/**
 * Stored or imported layouts, keeping what is valid: a corrupt entry, a
 * repeated id or name, or anything past the cap is dropped, and a value that
 * is not a layouts file reads as none. Older Ninja versions migrate.
 */
export function readSavedLayouts(value: unknown): SavedLayout[] {
  const file = value as Record<string, unknown> | null;
  if (
    !file ||
    typeof file !== "object" ||
    file.format !== LAYOUTS_FORMAT ||
    file.version !== 1 ||
    !Array.isArray(file.layouts)
  )
    return [];
  const kept: SavedLayout[] = [];
  for (const entry of file.layouts.slice(0, MAX_SAVED_LAYOUTS * 2)) {
    const saved = readEntry(entry);
    if (
      saved &&
      kept.length < MAX_SAVED_LAYOUTS &&
      !kept.some((k) => k.id === saved.id || sameName(k.name, saved.name))
    )
      kept.push(saved);
  }
  return kept;
}

/** The file both the local server and an export write. */
export function layoutsFile(layouts: SavedLayout[]) {
  return { format: LAYOUTS_FORMAT, version: 1 as const, layouts };
}

/** An import: bounded text in, the valid layouts it holds out. */
export function parseLayoutsText(text: string): SavedLayout[] {
  if (utf8Bytes(text) > MAX_LAYOUTS_FILE_BYTES)
    throw new LayoutError("Layout files must be under 180 KB.");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new LayoutError("Choose a valid layouts JSON file.");
  }
  const layouts = readSavedLayouts(value);
  if (!layouts.length)
    throw new LayoutError("That file holds no saved layouts.");
  return layouts;
}

/**
 * The list with `saved` in place of the entry with its id, or added last.
 * Refused when another layout already has the name, or the list is full.
 */
export function upsertLayout(list: SavedLayout[], saved: SavedLayout) {
  if (list.some((l) => l.id !== saved.id && sameName(l.name, saved.name)))
    throw new LayoutError(
      `A layout called “${saved.name}” already exists.`,
      "name_taken",
    );
  const index = list.findIndex((l) => l.id === saved.id);
  if (index >= 0) return list.map((l, i) => (i === index ? saved : l));
  if (list.length >= MAX_SAVED_LAYOUTS)
    throw new LayoutError(
      `Keep up to ${MAX_SAVED_LAYOUTS} layouts. Delete one to save another.`,
      "full",
    );
  return [...list, saved];
}

export function removeLayout(list: SavedLayout[], id: string) {
  if (!list.some((l) => l.id === id))
    throw new LayoutError("That layout no longer exists.", "missing");
  return list.filter((l) => l.id !== id);
}

/** `name`, or `name 2`, `name 3`… when another layout holds it. */
export function freeName(list: SavedLayout[], name: string, id?: string) {
  const taken = (candidate: string) =>
    list.some((l) => l.id !== id && sameName(l.name, candidate));
  if (!taken(name)) return name;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate =
      [...name].slice(0, MAX_LAYOUT_NAME - suffix.length).join("") + suffix;
    if (!taken(candidate)) return candidate;
  }
}

/** The rail choices a saved layout can keep, from the shell's per-workspace map. */
export function pickRails(value: Record<string, unknown>): RailChoices {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, open]) =>
        (RAIL_PRESETS as readonly string[]).includes(key) &&
        typeof open === "boolean",
    ),
  );
}
