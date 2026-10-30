/**
 * `parseScene`: validate an untrusted scene (a file, an agent's document)
 * and return a canonical copy, or throw with the reason. Every field is
 * named; an unknown field, shape, colour, material or role is refused.
 */
import { utf8Bytes } from "../ninja-layout";
import { inside, wallBounds } from "./bounds";
import { parseCharacters } from "./characters";
import {
  ACOUSTIC_ROOMS,
  SCENE_COLOURS,
  SCENE_ID,
  SCENE_LIMITS as L,
  SCENE_MATERIALS,
  SCENE_ROLES,
  SCENE_SHAPES,
  SCENE_VERSION,
  type SceneContent,
  type ScenePrimitive,
  type SceneSpec,
  type Vec3,
} from "./types";

export class SceneError extends Error {}

export const fail = (message: string): never => {
  throw new SceneError(message);
};

export function record(
  value: unknown,
  fields: readonly string[],
  what: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${what} must be an object.`);
  const extra = Object.keys(value as object).find((k) => !fields.includes(k));
  if (extra !== undefined) fail(`${what} has an unknown field "${extra}".`);
  return value as Record<string, unknown>;
}

export function sceneId(value: unknown, what = "Scene id"): string {
  if (typeof value !== "string" || !SCENE_ID.test(value))
    fail(`${what} must be a short lowercase id (a-z, 0-9, -).`);
  return value as string;
}

/** Labels and summaries: control characters become spaces, then capped. */
export function cleanText(value: unknown, max: number, what: string): string {
  if (typeof value !== "string") fail(`${what} must be text.`);
  const text = (value as string)
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return text;
}

export function number(
  value: unknown,
  min: number,
  max: number,
  what: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(`${what} must be a number from ${min} to ${max}.`);
  return value as number;
}

export function vec3(value: unknown, min: number, max: number, what: string) {
  if (!Array.isArray(value) || value.length !== 3)
    fail(`${what} must be three numbers.`);
  return (value as unknown[]).map((v) => number(v, min, max, what)) as Vec3;
}

export function oneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  what: string,
): T {
  if (typeof value !== "string" || !options.includes(value as T))
    fail(`Unknown ${what} "${String(value)}"; use ${options.join(", ")}.`);
  return value as T;
}

const position = (v: unknown, what = "Position") =>
  vec3(v, -L.maxPosition, L.maxPosition, what);

const PRIMITIVE_FIELDS = [
  "id",
  "shape",
  "position",
  "size",
  "rotationY",
  "colour",
  "material",
  "role",
  "hero",
  "glow",
] as const;

export function parsePrimitive(value: unknown): ScenePrimitive {
  const p = record(value, PRIMITIVE_FIELDS, "A primitive");
  const shape = oneOf(p.shape, SCENE_SHAPES, "shape");
  const role =
    p.role === undefined ? undefined : oneOf(p.role, SCENE_ROLES, "role");
  if (role && role !== "prop" && shape !== "box")
    fail(`A ${role} must be a box.`);
  for (const flag of ["hero", "glow"] as const)
    if (p[flag] !== undefined && typeof p[flag] !== "boolean")
      fail(`"${flag}" must be true or false.`);
  return {
    ...(p.id === undefined ? {} : { id: sceneId(p.id, "Primitive id") }),
    shape,
    position: position(p.position),
    size: vec3(p.size, L.minSize, L.maxSize, "Size"),
    ...(p.rotationY === undefined
      ? {}
      : {
          rotationY: number(
            p.rotationY,
            -2 * Math.PI,
            2 * Math.PI,
            "rotationY",
          ),
        }),
    colour: oneOf(p.colour, SCENE_COLOURS, "colour"),
    ...(p.material === undefined
      ? {}
      : { material: oneOf(p.material, SCENE_MATERIALS, "material") }),
    ...(role === undefined ? {} : { role }),
    ...(p.hero === undefined ? {} : { hero: p.hero as boolean }),
    ...(p.glow === undefined ? {} : { glow: p.glow as boolean }),
  };
}

export function parseContent(value: unknown): SceneContent {
  const kind = record(value, ["kind", "ground", "room"], "Content").kind;
  if (kind === "primitives") {
    const c = record(value, ["kind", "ground"], "Content");
    return {
      kind,
      ground: number(c.ground, L.ground[0], L.ground[1], "Ground"),
    };
  }
  if (kind === "acoustic-room") {
    const c = record(value, ["kind", "room"], "Content");
    return { kind, room: oneOf(c.room, ACOUSTIC_ROOMS, "acoustic room") };
  }
  return fail(
    `Unknown content "${String(kind)}"; use primitives or acoustic-room.`,
  );
}

export function parseScene(value: unknown): SceneSpec {
  const d = record(
    value,
    [
      "version",
      "revision",
      "id",
      "label",
      "summary",
      "subject",
      "listener",
      "scale",
      "fov",
      "content",
      "objects",
      "characters",
    ],
    "A scene",
  );
  if (d.version !== SCENE_VERSION)
    fail(`Choose a version ${SCENE_VERSION} scene.`);
  if (
    typeof d.revision !== "number" ||
    !Number.isSafeInteger(d.revision) ||
    d.revision < 0
  )
    fail("Revision must be a whole number from 0.");
  if (!Array.isArray(d.objects) || d.objects.length > L.primitives)
    fail(`A scene holds a list of up to ${L.primitives} primitives.`);
  const objects = (d.objects as unknown[]).map(parsePrimitive);
  const ids = objects.flatMap((p) => (p.id ? [p.id] : []));
  if (new Set(ids).size !== ids.length) fail("Duplicate primitive id.");
  const label = cleanText(d.label, L.label, "Label");
  if (!label) fail("A scene needs a label.");
  const spec: SceneSpec = {
    version: SCENE_VERSION,
    revision: d.revision as number,
    id: sceneId(d.id),
    label,
    summary: cleanText(d.summary, L.summary, "Summary"),
    subject: position(d.subject, "Subject"),
    ...(d.listener === undefined
      ? {}
      : { listener: position(d.listener, "Listener") }),
    scale: number(d.scale, L.scale[0], L.scale[1], "Scale"),
    fov: number(d.fov, L.fov[0], L.fov[1], "Field of view"),
    content: parseContent(d.content),
    objects,
    ...(d.characters === undefined
      ? {}
      : { characters: parseCharacters(d.characters) }),
  };
  const walls = wallBounds(spec);
  if (walls && !inside(spec.subject, walls))
    fail("The subject must be inside the room's walls.");
  if (walls && spec.listener && !inside(spec.listener, walls))
    fail("The listener must be inside the room's walls.");
  if (walls && spec.characters?.some((c) => !inside(c.position, walls)))
    fail("Characters must be inside the room's walls.");
  if (utf8Bytes(JSON.stringify(spec)) > L.bytes)
    fail(`A scene must be at most ${L.bytes / 1000} KB.`);
  return spec;
}
