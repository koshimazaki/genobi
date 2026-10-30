import { utf8Bytes } from "../ninja-layout";

export const SCROLLS_FORMAT = "genobi.scrolls.v1";
export const SCROLLS_LIMIT = 64_000;
export const MAX_CELLS = 16;
export const MAX_ASSETS = 48;
/**
 * The longest prompt a brief or an asset records. A generated asset records
 * the person's own prompt (brief and compiled panels, never the example
 * pairs), so it always fits; the generator refuses one that would not.
 */
export const PROMPT_LIMIT = 4000;
export const ID = /^[a-z][a-z0-9-]{0,63}$/;
export type ScrollKind = "character" | "storyboard";
export type AssetRole = "character" | "panel" | "style" | "audio";
export type RegionBox = [number, number, number, number];
export interface SheetRegion {
  assetId: string;
  box: RegionBox;
}
export interface ScrollCell {
  id: string;
  title: string;
  prompt: string;
  camera: string;
  action: string;
  durationFrames: number;
  startFrame?: number;
  region?: SheetRegion;
  assetId?: string;
}
/**
 * How a generated sheet was made: the registry entry it ran on and the
 * references it was made like, by name and content hash. Hashes rather than
 * asset IDs, so removing a reference later never breaks the record.
 */
export interface ScrollGeneration {
  entry: string;
  references: { name: string; sha256: string }[];
}
export interface ScrollAsset {
  id: string;
  name: string;
  role: AssetRole;
  kind: "image" | "audio";
  file: { path: string; sha256: string };
  durationSeconds?: number;
  cellId?: string;
  prompt?: string;
  origin: "uploaded" | "generated";
  derivedFrom?: SheetRegion;
  generation?: ScrollGeneration;
}
export interface ScrollDocument {
  format: typeof SCROLLS_FORMAT;
  id: string;
  revision: number;
  kind: ScrollKind;
  name: string;
  prompt: string;
  /** The Script: what the person wants in the video, in their words. */
  script?: string;
  cells: ScrollCell[];
  assets: ScrollAsset[];
  selectedIds: string[];
  sheetAssetId?: string;
  timing: {
    enabled: boolean;
    fps: number;
    bpm: number;
    audioId?: string;
    beatOffsetSeconds?: number;
    audioStartFrame?: number;
    sourceStartFrame?: number;
  };
}
export const fail = (message: string): never => {
  throw new Error(message);
};
export function object(
  value: unknown,
  fields: string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Expected an object.");
  if (Object.keys(value as object).some((key) => !fields.includes(key)))
    fail("Unexpected Scrolls field.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
  )
    fail(`Text must be at most ${max} characters without control characters.`);
  return value as string;
}
function fileName(value: unknown): string {
  const name = text(value, 120);
  if (/[\x00-\x1f\x7f]/.test(name))
    fail("A file name cannot contain control characters.");
  return name;
}
export function id(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) fail("Invalid Scrolls ID.");
  return value as string;
}
export function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail(`Use a whole number from ${min} to ${max}.`);
  return value as number;
}
export function parseCell(value: unknown): ScrollCell {
  const c = object(value, [
    "id",
    "title",
    "prompt",
    "camera",
    "action",
    "durationFrames",
    "startFrame",
    "region",
    "assetId",
  ]);
  return {
    id: id(c.id),
    title: text(c.title, 80),
    prompt: text(c.prompt, 1500),
    camera: text(c.camera, 300),
    action: text(c.action, 300),
    durationFrames: integer(c.durationFrames, 1, 3600),
    ...(c.startFrame === undefined
      ? {}
      : { startFrame: integer(c.startFrame, 0, 7200) }),
    ...(c.region === undefined ? {} : { region: parseRegion(c.region) }),
    ...(c.assetId === undefined ? {} : { assetId: id(c.assetId) }),
  };
}
export function parseAsset(value: unknown): ScrollAsset {
  const a = object(value, [
    "id",
    "name",
    "role",
    "kind",
    "file",
    "durationSeconds",
    "cellId",
    "prompt",
    "origin",
    "derivedFrom",
    "generation",
  ]);
  const file = object(a.file, ["path", "sha256"]);
  if (
    typeof file.path !== "string" ||
    !/^media\/[a-z][a-z0-9-]{0,63}\.(png|jpg|jpeg|webp|wav|flac|mp3)$/.test(
      file.path,
    ) ||
    typeof file.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(file.sha256)
  )
    fail("Invalid media path or hash.");
  if (
    !["character", "panel", "style", "audio"].includes(String(a.role)) ||
    !["image", "audio"].includes(String(a.kind)) ||
    !["uploaded", "generated"].includes(String(a.origin))
  )
    fail("Invalid Scrolls asset.");
  if (
    (a.role === "audio") !== (a.kind === "audio") ||
    (a.kind === "audio") !== /\.(wav|flac|mp3)$/.test(file.path as string)
  )
    fail("Asset kind and role must match its file.");
  if (
    a.kind === "audio" &&
    (typeof a.durationSeconds !== "number" ||
      !Number.isFinite(a.durationSeconds) ||
      a.durationSeconds <= 0 ||
      a.durationSeconds > 1200)
  )
    fail("Audio must have a measured duration, up to 20 minutes.");
  if (a.kind === "image" && a.durationSeconds !== undefined)
    fail("Images have no source duration.");
  return {
    id: id(a.id),
    // A file name becomes a Director layer name and part of the brief, so it
    // gets the filename rule: no control characters at all, tabs and breaks too.
    name: fileName(a.name),
    role: a.role as AssetRole,
    kind: a.kind as ScrollAsset["kind"],
    origin: a.origin as ScrollAsset["origin"],
    ...(a.derivedFrom === undefined
      ? {}
      : { derivedFrom: parseRegion(a.derivedFrom) }),
    file: { path: file.path as string, sha256: file.sha256 as string },
    ...(a.durationSeconds === undefined
      ? {}
      : { durationSeconds: a.durationSeconds as number }),
    ...(a.cellId === undefined ? {} : { cellId: id(a.cellId) }),
    ...(a.prompt === undefined ? {} : { prompt: text(a.prompt, PROMPT_LIMIT) }),
    ...(a.generation === undefined
      ? {}
      : { generation: parseGeneration(a.generation, a.origin) }),
  };
}
function parseGeneration(value: unknown, origin: unknown): ScrollGeneration {
  if (origin !== "generated") fail("Only generated assets record a model.");
  const g = object(value, ["entry", "references"]);
  if (typeof g.entry !== "string" || !/^[a-z0-9-]{1,64}$/.test(g.entry))
    fail("Invalid generation model.");
  if (!Array.isArray(g.references) || g.references.length > 10)
    fail("A generation records at most 10 references.");
  return {
    entry: g.entry as string,
    references: (g.references as unknown[]).map((value) => {
      const r = object(value, ["name", "sha256"]);
      if (typeof r.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(r.sha256))
        fail("Invalid reference hash.");
      return { name: fileName(r.name), sha256: r.sha256 as string };
    }),
  };
}
export function parseScroll(value: unknown): ScrollDocument {
  const d = object(value, [
    "format",
    "id",
    "revision",
    "kind",
    "name",
    "prompt",
    "script",
    "cells",
    "assets",
    "selectedIds",
    "sheetAssetId",
    "timing",
  ]);
  if (
    d.format !== SCROLLS_FORMAT ||
    !["character", "storyboard"].includes(String(d.kind))
  )
    fail("Choose a Scrolls v1 document.");
  if (
    !Array.isArray(d.cells) ||
    !d.cells.length ||
    d.cells.length > MAX_CELLS ||
    !Array.isArray(d.assets) ||
    d.assets.length > MAX_ASSETS ||
    !Array.isArray(d.selectedIds) ||
    d.selectedIds.length > MAX_ASSETS
  )
    fail("Scrolls supports 1–16 cells and up to 48 assets.");
  const cells = (d.cells as unknown[]).map(parseCell),
    assets = (d.assets as unknown[]).map(parseAsset),
    selectedIds = (d.selectedIds as unknown[]).map(id);
  for (const ids of [
    cells.map((c) => c.id),
    assets.map((a) => a.id),
    selectedIds,
  ])
    if (new Set(ids).size !== ids.length) fail("Duplicate Scrolls ID.");
  if (new Set(assets.map((a) => a.file.path)).size !== assets.length)
    fail("Duplicate media path.");
  for (const c of cells)
    if (
      c.assetId &&
      !assets.some((a) => a.id === c.assetId && a.kind === "image")
    )
      fail("A cell needs an existing image.");
  for (const a of assets)
    if (a.cellId && !cells.some((c) => c.id === a.cellId))
      fail("Asset names an unknown cell.");
  for (const selected of selectedIds)
    if (!assets.some((a) => a.id === selected))
      fail("Selection names a missing asset.");
  const t = object(d.timing, [
    "enabled",
    "fps",
    "bpm",
    "audioId",
    "beatOffsetSeconds",
    "audioStartFrame",
    "sourceStartFrame",
  ]);
  if (
    typeof t.enabled !== "boolean" ||
    typeof t.bpm !== "number" ||
    !Number.isFinite(t.bpm) ||
    t.bpm < 20 ||
    t.bpm > 300
  )
    fail("Invalid timing settings.");
  if (
    t.audioId !== undefined &&
    !assets.some((a) => a.id === t.audioId && a.kind === "audio")
  )
    fail("Choose an audio asset.");
  const result: ScrollDocument = {
    format: SCROLLS_FORMAT,
    id: id(d.id),
    revision: integer(d.revision, 0, Number.MAX_SAFE_INTEGER - 1),
    kind: d.kind as ScrollKind,
    name: text(d.name, 120),
    prompt: text(d.prompt, PROMPT_LIMIT),
    ...(d.script === undefined ? {} : { script: text(d.script, PROMPT_LIMIT) }),
    cells,
    assets,
    selectedIds,
    ...(d.sheetAssetId === undefined
      ? {}
      : { sheetAssetId: id(d.sheetAssetId) }),
    timing: {
      enabled: t.enabled as boolean,
      fps: integer(t.fps, 1, 60),
      bpm: t.bpm as number,
      ...(t.beatOffsetSeconds === undefined
        ? {}
        : { beatOffsetSeconds: offset(t.beatOffsetSeconds) }),
      ...(t.audioStartFrame === undefined
        ? {}
        : { audioStartFrame: integer(t.audioStartFrame, 0, 7200) }),
      ...(t.sourceStartFrame === undefined
        ? {}
        : { sourceStartFrame: integer(t.sourceStartFrame, 0, 72000) }),
      ...(t.audioId === undefined ? {} : { audioId: id(t.audioId) }),
    },
  };
  if (utf8Bytes(JSON.stringify(result)) > SCROLLS_LIMIT)
    fail("Scrolls document exceeds 64 KB.");
  if (
    result.sheetAssetId &&
    !assets.some((a) => a.id === result.sheetAssetId && a.kind === "image")
  )
    fail("The sheet must be an existing image.");
  for (const region of [
    ...cells.map((c) => c.region),
    ...assets.map((a) => a.derivedFrom),
  ])
    if (
      region &&
      !assets.some((a) => a.id === region.assetId && a.kind === "image")
    )
      fail("Region source is missing.");
  for (const a of assets) {
    if (a.derivedFrom && a.kind !== "image")
      fail("Only images can be region crops.");
    const seen = new Set([a.id]);
    let parent = a.derivedFrom?.assetId;
    while (parent) {
      if (seen.has(parent)) fail("Crop sources cannot form a cycle.");
      seen.add(parent);
      parent = assets.find((source) => source.id === parent)?.derivedFrom
        ?.assetId;
    }
  }
  let cursor = 0;
  const intervals = cells
    .map((c) => {
      const start = c.startFrame ?? cursor;
      cursor = start + c.durationFrames;
      return { start, end: cursor };
    })
    .sort((a, b) => a.start - b.start);
  if (
    intervals.some(
      (v, i) =>
        v.end / result.timing.fps > 120 ||
        (i > 0 && v.start < intervals[i - 1].end),
    )
  )
    fail("Keep cells within two minutes, without overlaps.");
  if ((result.timing.audioStartFrame ?? 0) / result.timing.fps >= 120)
    fail("Audio must start within two minutes.");
  const audio = assets.find((a) => a.id === result.timing.audioId);
  if (
    audio &&
    (result.timing.sourceStartFrame ?? 0) / result.timing.fps >=
      audio.durationSeconds!
  )
    fail("Audio in-point is past the source.");
  return result;
}

function offset(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 120
  )
    fail("Invalid beat offset.");
  return value as number;
}
export function parseRegion(value: unknown): SheetRegion {
  const r = object(value, ["assetId", "box"]);
  if (!Array.isArray(r.box) || r.box.length !== 4)
    fail("Region needs four coordinates.");
  const box = (r.box as unknown[]).map((v) => integer(v, 0, 1000)) as RegionBox;
  if (box[2] - box[0] < 10 || box[3] - box[1] < 10)
    fail("Region must have positive bounds (at least 1% per edge).");
  return { assetId: id(r.assetId), box };
}
