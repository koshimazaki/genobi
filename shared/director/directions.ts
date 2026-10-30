// The prompt and direction contract of a Director project: one global
// prompt for the whole piece, and per clip its own prompt and typed
// directions (shot, lens, camera, subject action). The free text and the
// typed choices are separate fields, so a menu change never rewrites what the
// person wrote. Portable: no Node or DOM APIs.
import { cameraSections, type CameraSelection } from "../camera";
import { isObject, refuse } from "./layer-commands";
import type { Project } from "./types";

/** The global prompt's limit: the project prompt brief's (`PROMPT_LIMIT`). */
export const GLOBAL_PROMPT_LIMIT = 12000;
/** A clip's prompt: one generation's description (`server/validation.ts`). */
export const CLIP_PROMPT_LIMIT = 1200;

/**
 * Storyboard shot types, from the Editor timeline mock's Shot picker. A
 * creative label for the shot, not the camera's shot-size term: the camera
 * (`directions.camera`) carries Genobi's own camera wording.
 */
export const SHOT_TYPES = [
  { id: "wide", label: "Wide" },
  { id: "aerial", label: "Aerial" },
  { id: "medium", label: "Medium" },
  { id: "close-up", label: "Close-up" },
  { id: "insert", label: "Insert / macro" },
  { id: "low-angle", label: "Low angle" },
  { id: "crane-wide", label: "Crane wide" },
  { id: "pass-by", label: "Pass-by" },
  { id: "heroic-medium", label: "Heroic medium" },
] as const;
/**
 * Lens feel, from the mock's Lens picker. Creative direction only: no model
 * takes a focal length, and no calibrated optics are promised.
 */
export const LENSES = [
  { id: "14mm", label: "14mm" },
  { id: "18mm", label: "18mm" },
  { id: "24mm", label: "24mm" },
  { id: "35mm", label: "35mm" },
  { id: "50mm", label: "50mm" },
  { id: "85mm", label: "85mm" },
  { id: "100mm", label: "100mm" },
  { id: "135mm", label: "135mm" },
  { id: "200mm", label: "200mm" },
] as const;
/**
 * How the subject moves, from the mock's Subject action picker. The ids are
 * the mock's movement glyph names, so a picker draws them directly.
 */
export const SUBJECT_ACTIONS = [
  { id: "forward", label: "Move forward" },
  { id: "arc", label: "Arc across frame" },
  { id: "zigzag", label: "Zig-zag" },
  { id: "rise", label: "Rise / ascend" },
  { id: "accel", label: "Accelerate" },
  { id: "decel", label: "Decelerate" },
  { id: "converge", label: "Converge" },
  { id: "hold", label: "Hold / brace" },
  { id: "drop", label: "Drop / descend" },
  { id: "impact", label: "Impact" },
  { id: "infinity", label: "Loop / charge" },
  { id: "release", label: "Release / settle" },
] as const;
export type ShotType = (typeof SHOT_TYPES)[number]["id"];
export type Lens = (typeof LENSES)[number]["id"];
export type SubjectAction = (typeof SUBJECT_ACTIONS)[number]["id"];

/** A clip's typed directions; every field optional, absent means unset. */
export interface LayerDirections {
  shot?: ShotType;
  lens?: Lens;
  /** Genobi's camera terms (`shared/camera.ts`), one per section or null. */
  camera?: CameraSelection;
  action?: SubjectAction;
}
/** What `set-clip-directions` sends: a value sets a field, null clears it. */
export type DirectionsPatch = {
  [K in keyof LayerDirections]?: LayerDirections[K] | null;
};
export const DIRECTION_FIELDS = ["shot", "lens", "camera", "action"] as const;

const VOCABULARY = {
  shot: SHOT_TYPES,
  lens: LENSES,
  action: SUBJECT_ACTIONS,
} as const;

/** The prompt keeps its line breaks; other control characters become spaces. */
export const cleanPrompt = (text: string) =>
  text.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, " ");

/** Prompt text from untrusted data: a string within `limit`, cleaned. */
export function readPrompt(value: unknown, limit: number, what = "text") {
  if (typeof value !== "string" || value.length > limit)
    refuse(`${what} must be at most ${limit} characters`);
  return cleanPrompt(value as string);
}

/** Every camera section named, each a term that section offers or null. */
export function readCamera(value: unknown): CameraSelection {
  if (!isObject(value)) return refuse("camera must be an object");
  const ids = cameraSections.map((s) => s.id as string);
  const other = Object.keys(value).find((k) => !ids.includes(k));
  if (other) refuse(`camera has no section ${other.slice(0, 40)}`);
  const camera: Record<string, string | null> = {};
  for (const section of cameraSections) {
    const term = value[section.id] ?? null;
    if (term !== null && !section.terms.some((t) => t.id === term))
      refuse(`${section.label} has no term ${String(term).slice(0, 40)}`);
    camera[section.id] = term as string | null;
  }
  return camera as CameraSelection;
}

/** A directions patch from untrusted data: known fields, known values. */
export function readDirections(value: unknown): DirectionsPatch {
  if (!isObject(value)) return refuse("directions must be an object");
  const keys = Object.keys(value);
  const other = keys.find(
    (k) => !(DIRECTION_FIELDS as readonly string[]).includes(k),
  );
  if (other) refuse(`directions has no field ${other.slice(0, 40)}`);
  if (!keys.length) refuse("directions needs shot, lens, camera or action");
  const out: Record<string, unknown> = {};
  for (const key of DIRECTION_FIELDS) {
    if (!(key in value)) continue;
    const v = value[key];
    if (v === null) out[key] = null;
    else if (key === "camera") out.camera = readCamera(v);
    else {
      const choice = VOCABULARY[key].find((c) => c.id === v);
      if (!choice)
        refuse(
          `${key} must be one of ${VOCABULARY[key].map((c) => c.id).join(", ")}`,
        );
      out[key] = v;
    }
  }
  return out as DirectionsPatch;
}

/** Directions after a patch; undefined when nothing is left set. */
export function patchDirections(
  current: LayerDirections | undefined,
  patch: DirectionsPatch,
): LayerDirections | undefined {
  const next: Record<string, unknown> = { ...current };
  for (const key of DIRECTION_FIELDS)
    if (patch[key] === null) delete next[key];
    else if (patch[key] !== undefined) next[key] = patch[key];
  return Object.keys(next).length ? (next as LayerDirections) : undefined;
}

/**
 * What the schema cannot see: a clip's camera terms are ones Genobi offers.
 * The schema has already held the shape, enums, lengths and characters.
 */
export function checkDirections(p: Project) {
  for (const l of p.layers)
    if (l.directions?.camera)
      try {
        readCamera(l.directions.camera);
      } catch (error) {
        throw new Error(
          `${l.name}: ${error instanceof Error ? error.message : error}`,
          { cause: error },
        );
      }
}

const label = (key: keyof typeof VOCABULARY, id: string | undefined) =>
  VOCABULARY[key].find((c) => c.id === id)?.label;

/** A clip's directions in words, for an agent or a label; "" when none. */
export function directionWords(directions: LayerDirections | undefined) {
  if (!directions) return "";
  const camera = directions.camera
    ? cameraSections
        .map(
          (s) => s.terms.find((t) => t.id === directions.camera?.[s.id])?.label,
        )
        .filter(Boolean)
        .join(", ")
    : "";
  return [
    directions.shot && `shot ${label("shot", directions.shot)}`,
    directions.lens && `lens ${label("lens", directions.lens)} (feel)`,
    camera && `camera ${camera}`,
    directions.action && `action ${label("action", directions.action)}`,
  ]
    .filter(Boolean)
    .join("; ");
}
