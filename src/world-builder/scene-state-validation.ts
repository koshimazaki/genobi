import type { Recipe } from "./recipe";
import { MOD_SOURCES } from "./mod-routes";
import { validTransform } from "./scene-contract";
import { motionInstances } from "./scene-instances";
import { roomPointInside } from "./scene-room";
import {
  MAX_SCENE_INSTANCES,
  MAX_SCENE_KEYS,
  ROOM_FACES,
  SCENE_CONTROL_RANGES,
  SCENE_MAPPING_RANGES,
  type SceneMotion,
  type SceneRoom,
  type SceneVector,
} from "./scene-state";

const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const integer = (v: unknown, lo: number, hi: number) =>
  finite(v, lo, hi) && Number.isInteger(v);
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9][\w-]{0,47}$/.test(v);
const fields = (v: unknown, allowed: string[]): v is Record<string, unknown> =>
  plain(v) && Object.keys(v).every((k) => allowed.includes(k));
const vector = (v: unknown, lo: number, hi: number): v is SceneVector =>
  Array.isArray(v) && v.length === 3 && v.every((n) => finite(n, lo, hi));
const fail = (message: string): never => {
  throw new Error(message);
};

function validateRoom(input: unknown): asserts input is SceneRoom {
  if (
    !fields(input, [
      "id",
      "dimensions",
      "center",
      "source",
      "listener",
      "absorption",
      "seed",
      "wallThickness",
      "visible",
      "cutaway",
    ]) ||
    !id(input.id) ||
    !vector(input.dimensions, 1, 32) ||
    !vector(input.center, -40, 40) ||
    !vector(input.source, -40, 40) ||
    !vector(input.listener, -40, 40) ||
    !roomPointInside(input.source, input.dimensions) ||
    !roomPointInside(input.listener, input.dimensions) ||
    !integer(input.seed, 0, 0xffffffff) ||
    !finite(input.wallThickness, 0.02, 0.5) ||
    typeof input.visible !== "boolean" ||
    (input.cutaway !== undefined && typeof input.cutaway !== "boolean") ||
    !fields(input.absorption, [...ROOM_FACES]) ||
    ROOM_FACES.some(
      (face) =>
        !finite(
          (input.absorption as Record<string, unknown>)[face],
          0.01,
          0.99,
        ),
    )
  )
    fail(
      "Invalid single acoustic room: check dimensions, absorption and source/listener bounds.",
    );
}

/** No inferred geometry, arbitrary generators, topology changes or silent key reordering. */
export function validateSceneMotion(
  input: unknown,
  recipe: Pick<Recipe, "objects" | "frames">,
): SceneMotion {
  if (
    !fields(input, [
      "version",
      "pivot",
      "instances",
      "stateKeys",
      "mappings",
      "intensity",
      "room",
    ]) ||
    input.version !== 1 ||
    !vector(input.pivot, -40, 40) ||
    !finite(input.intensity, 0, 2)
  )
    fail("Invalid scene motion version, pivot or intensity.");
  const motion = input as unknown as SceneMotion;
  const authoredIds = recipe.objects.map((p) => p.id);
  const instanceIds: string[] = [];
  if (motion.instances !== undefined) {
    const g = motion.instances;
    if (
      !fields(g, [
        "generator",
        "version",
        "seed",
        "count",
        "columns",
        "spacing",
        "size",
        "palette",
      ]) ||
      g.generator !== "voxel-lattice" ||
      g.version !== 1 ||
      !integer(g.seed, 0, 0xffffffff) ||
      !integer(g.count, 1, MAX_SCENE_INSTANCES) ||
      !integer(g.columns, 1, 8) ||
      !finite(g.spacing, 0.1, 3) ||
      !finite(g.size, 0.1, 3) ||
      !Array.isArray(g.palette) ||
      !g.palette.length ||
      g.palette.length > 8 ||
      g.palette.some((c) => typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c))
    )
      fail(
        `Invalid voxel generator: use 1 to ${MAX_SCENE_INSTANCES} bounded instances.`,
      );
    for (const p of motionInstances(g)) {
      if (![p.x, p.y, p.z].every((n) => finite(n, -40, 40)))
        fail("Voxel lattice exceeds the scene bounds.");
      if (authoredIds.includes(p.id))
        fail("Voxel and authored object IDs must be distinct.");
      instanceIds.push(p.id);
    }
  }
  if (motion.room !== undefined) {
    validateRoom(motion.room);
    if (authoredIds.some((value) => value.startsWith("scene-room-")))
      fail("The scene-room- object prefix is reserved for derived surfaces.");
  }
  if (
    !Array.isArray(motion.stateKeys) ||
    !motion.stateKeys.length ||
    motion.stateKeys.length > MAX_SCENE_KEYS
  )
    fail(`Use 1 to ${MAX_SCENE_KEYS} ordered scene states.`);
  const keyIds = new Set<string>(),
    validIds = new Set([...authoredIds, ...instanceIds]);
  let previousFrame = -1;
  let objectIds: string[] | undefined;
  for (const key of motion.stateKeys) {
    if (
      !fields(key, [
        "id",
        "label",
        "frame",
        "easing",
        "objects",
        "controls",
        "room",
      ]) ||
      !id(key.id) ||
      keyIds.has(key.id) ||
      typeof key.label !== "string" ||
      !key.label.trim() ||
      key.label.length > 80 ||
      !integer(key.frame, 0, recipe.frames - 1) ||
      key.frame <= previousFrame ||
      !["linear", "easeInOut"].includes(key.easing) ||
      !plain(key.objects)
    )
      fail(
        "Invalid scene state: IDs must be unique and frames strictly ordered inside the take.",
      );
    if (previousFrame === -1 && key.frame !== 0)
      fail("The first scene state must be at frame zero.");
    keyIds.add(key.id);
    previousFrame = key.frame;
    const ids = Object.keys(key.objects).sort();
    if (
      ids.some((value) => !validIds.has(value)) ||
      instanceIds.some((value) => !ids.includes(value)) ||
      (objectIds &&
        (objectIds.length !== ids.length ||
          objectIds.some((value, i) => value !== ids[i])))
    )
      fail(
        "Scene states must retain the same object identities and every voxel instance.",
      );
    objectIds = ids;
    for (const transform of Object.values(key.objects)) {
      if (
        !fields(transform, [
          "x",
          "y",
          "z",
          "scale",
          "rotation",
          "rotationX",
          "rotationZ",
          "scaleX",
          "scaleY",
          "scaleZ",
        ]) ||
        ![transform.x, transform.y, transform.z].every((v) =>
          finite(v, -40, 40),
        ) ||
        !finite(transform.scale, 0.1, 8) ||
        !validTransform(transform)
      )
        fail(
          "Invalid scene state transform; topology and materials cannot change between states.",
        );
    }
    if (
      key.controls !== undefined &&
      (!fields(key.controls, Object.keys(SCENE_CONTROL_RANGES)) ||
        Object.entries(key.controls).some(([property, value]) => {
          const [lo, hi] =
            SCENE_CONTROL_RANGES[property as keyof typeof SCENE_CONTROL_RANGES];
          return !finite(value, lo, hi);
        }))
    )
      fail("Invalid bounded scene controls.");
    if (key.room !== undefined) {
      if (
        !motion.room ||
        !fields(key.room, ["dimensions", "source", "listener"]) ||
        !vector(key.room.dimensions, 1, 32) ||
        (key.room.source !== undefined && !vector(key.room.source, -40, 40)) ||
        (key.room.listener !== undefined && !vector(key.room.listener, -40, 40))
      )
        fail("Scene room state requires one valid acoustic enclosure.");
    }
    if (motion.room) {
      const dimensions = key.room?.dimensions ?? motion.room.dimensions;
      if (
        !roomPointInside(key.room?.source ?? motion.room.source, dimensions) ||
        !roomPointInside(key.room?.listener ?? motion.room.listener, dimensions)
      )
        fail("State source and listener must remain inside the acoustic room.");
    }
  }
  if (!Array.isArray(motion.mappings) || motion.mappings.length > 16)
    fail("Use at most 16 scene audio mappings.");
  const routeIds = new Set<string>();
  for (const mapping of motion.mappings) {
    if (
      !fields(mapping, ["id", "source", "property", "amount", "enabled"]) ||
      !id(mapping.id) ||
      routeIds.has(mapping.id) ||
      !MOD_SOURCES.includes(mapping.source) ||
      !Object.hasOwn(SCENE_MAPPING_RANGES, mapping.property) ||
      typeof mapping.enabled !== "boolean"
    )
      fail("Invalid scene audio mapping.");
    const [lo, hi] = SCENE_MAPPING_RANGES[mapping.property];
    if (!finite(mapping.amount, lo, hi))
      fail("Scene audio amount exceeds its bounded range.");
    if (mapping.property.startsWith("room") && !motion.room)
      fail("Room audio mapping requires an acoustic enclosure.");
    if (
      mapping.property !== "morph" &&
      !mapping.property.startsWith("room") &&
      !motion.instances
    )
      fail("Voxel motion mappings require a voxel instance group.");
    routeIds.add(mapping.id);
  }
  return motion;
}
