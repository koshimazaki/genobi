/**
 * Pure, revision-checked scene edits, shared by the MCP tool and tests. A
 * command names the document's current revision; a stale one is refused.
 * Every result is parsed again, so an edit cannot leave an invalid scene.
 */
import {
  cleanText,
  fail,
  number,
  oneOf,
  parseContent,
  parsePrimitive,
  parseScene,
  record,
  sceneId,
  vec3,
} from "./parse";
import { parseRoomOptions, roomBox, ROOM_FIELDS } from "./room";
import { isBoundary } from "./bounds";
import {
  SCENE_COLOURS,
  SCENE_LIMITS as L,
  SCENE_MATERIALS,
  SCENE_ROLES,
  SCENE_VERSION,
  type ScenePrimitive,
  type SceneSpec,
} from "./types";

export const SCENE_COMMANDS = [
  "add-primitive",
  "remove-primitive",
  "set-primitive",
  "set-subject",
  "set-content",
  "set-camera",
  "set-characters",
  "room",
] as const;

/** An empty set: ground, the subject at a standing figure's chest, no objects. */
export function createScene(id = "scene", label = "Untitled scene"): SceneSpec {
  return parseScene({
    version: SCENE_VERSION,
    revision: 0,
    id: sceneId(id),
    label: cleanText(label, L.label, "Label") || "Untitled scene",
    summary: "",
    subject: [0, 1.2, 0],
    scale: 1,
    fov: 38,
    content: { kind: "primitives", ground: 120 },
    objects: [],
  });
}

const FIELDS: Record<(typeof SCENE_COMMANDS)[number], readonly string[]> = {
  "add-primitive": ["primitive"],
  "remove-primitive": ["id"],
  "set-primitive": [
    "id",
    "position",
    "size",
    "rotationY",
    "colour",
    "material",
    "role",
  ],
  "set-subject": ["subject", "listener"],
  "set-content": ["content"],
  "set-camera": ["fov", "scale"],
  "set-characters": ["characters"],
  room: ROOM_FIELDS,
};

function find(objects: ScenePrimitive[], value: unknown) {
  const id = sceneId(value, "Primitive id");
  const index = objects.findIndex((p) => p.id === id);
  if (index < 0) fail(`No primitive "${id}".`);
  return index;
}

export function applyCommand(
  doc: SceneSpec,
  command: unknown,
  revision: unknown,
): SceneSpec {
  const current = parseScene(doc);
  if (revision !== current.revision)
    fail("Scene changed; read its current revision before editing.");
  const op = oneOf(
    record(
      command,
      ["op", ...new Set(Object.values(FIELDS).flat())],
      "A command",
    ).op,
    SCENE_COMMANDS,
    "command",
  );
  const c = record(command, ["op", ...FIELDS[op]], `The ${op} command`);
  const next = structuredClone(current) as SceneSpec & {
    objects: ScenePrimitive[];
  };
  switch (op) {
    case "set-characters":
      next.characters = c.characters as SceneSpec["characters"];
      if (c.characters === undefined)
        fail("Give the character list, or an empty list to remove it.");
      break;
    case "add-primitive": {
      const p = parsePrimitive(c.primitive);
      if (!p.id) fail("A new primitive needs an id.");
      if (next.objects.some((o) => o.id === p.id))
        fail(`Primitive "${p.id}" already exists.`);
      next.objects.push(p);
      break;
    }
    case "remove-primitive":
      next.objects.splice(find(next.objects, c.id), 1);
      break;
    case "set-primitive": {
      const i = find(next.objects, c.id);
      const p = { ...next.objects[i] };
      if (c.position !== undefined)
        p.position = vec3(
          c.position,
          -L.maxPosition,
          L.maxPosition,
          "Position",
        );
      if (c.size !== undefined)
        p.size = vec3(c.size, L.minSize, L.maxSize, "Size");
      if (c.rotationY !== undefined)
        p.rotationY = number(
          c.rotationY,
          -2 * Math.PI,
          2 * Math.PI,
          "rotationY",
        );
      if (c.colour !== undefined)
        p.colour = oneOf(c.colour, SCENE_COLOURS, "colour");
      if (c.material !== undefined)
        p.material = oneOf(c.material, SCENE_MATERIALS, "material");
      if (c.role !== undefined) p.role = oneOf(c.role, SCENE_ROLES, "role");
      next.objects[i] = parsePrimitive(p);
      break;
    }
    case "set-subject":
      if (c.subject === undefined && c.listener === undefined)
        fail("Give a subject or a listener.");
      if (c.subject !== undefined)
        next.subject = vec3(
          c.subject,
          -L.maxPosition,
          L.maxPosition,
          "Subject",
        );
      if (c.listener !== undefined)
        next.listener = vec3(
          c.listener,
          -L.maxPosition,
          L.maxPosition,
          "Listener",
        );
      break;
    case "set-content":
      next.content = parseContent(c.content);
      break;
    case "set-camera":
      if (c.fov === undefined && c.scale === undefined)
        fail("Give a field of view or a scale.");
      if (c.fov !== undefined)
        next.fov = number(c.fov, L.fov[0], L.fov[1], "Field of view");
      if (c.scale !== undefined)
        next.scale = number(c.scale, L.scale[0], L.scale[1], "Scale");
      break;
    case "room": {
      // A new room replaces the old one's walls, floor and ceiling.
      const { op: _op, ...options } = c;
      void _op;
      const walls = roomBox(parseRoomOptions(options));
      const kept = next.objects.filter(
        (p) => !isBoundary(p) && !walls.some((w) => w.id === p.id),
      );
      next.objects = [...walls, ...kept];
      break;
    }
  }
  next.revision++;
  return parseScene(next);
}
