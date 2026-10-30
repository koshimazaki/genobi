/**
 * `roomBox`: a rectangular room in one call, as the wall, floor and ceiling
 * boxes acoustics reads. The interior spans x ±width/2, z ±length/2 and y 0
 * to height, so the floor's top is the ground; walls are 0.1 m thick and sit
 * outside it. A door is the gap left in its wall, nothing more.
 */
import { fail, number, oneOf, record } from "./parse";
import {
  SCENE_MATERIALS,
  type SceneMaterial,
  type ScenePrimitive,
  type SceneRole,
  type Vec3,
} from "./types";

export const WALL_THICKNESS = 0.1;
export const ROOM_WALLS = ["north", "south", "east", "west"] as const;
export type RoomWall = (typeof ROOM_WALLS)[number];

export interface RoomDoor {
  wall: RoomWall;
  /** The door's centre along its wall, in metres from the wall's middle. */
  offset: number;
  width: number;
  height: number;
}

export interface RoomOptions {
  width: number;
  length: number;
  height: number;
  wallMaterial: SceneMaterial;
  floorMaterial: SceneMaterial;
  ceilingMaterial: SceneMaterial;
  door?: RoomDoor;
  /** Leave the ceiling out (a set seen from above). */
  openTop?: boolean;
}

export const ROOM_FIELDS = [
  "width",
  "length",
  "height",
  "wallMaterial",
  "floorMaterial",
  "ceilingMaterial",
  "door",
  "openTop",
] as const;

export function parseRoomOptions(value: unknown): RoomOptions {
  const o = record(value, ROOM_FIELDS, "A room");
  const width = number(o.width, 0.5, 200, "Room width");
  const length = number(o.length, 0.5, 200, "Room length");
  const height = number(o.height, 0.5, 100, "Room height");
  const material = (v: unknown, what: string) =>
    oneOf(v, SCENE_MATERIALS, `${what} material`);
  if (o.openTop !== undefined && typeof o.openTop !== "boolean")
    fail('"openTop" must be true or false.');
  let door: RoomDoor | undefined;
  if (o.door !== undefined) {
    const d = record(o.door, ["wall", "offset", "width", "height"], "A door");
    const wall = oneOf(d.wall, ROOM_WALLS, "wall");
    const span = wall === "north" || wall === "south" ? width : length;
    door = {
      wall,
      offset: number(d.offset, -span / 2, span / 2, "Door offset"),
      width: number(d.width, 0.3, span, "Door width"),
      height: number(d.height, 0.5, height, "Door height"),
    };
    if (Math.abs(door.offset) + door.width / 2 > span / 2 + 1e-9)
      fail("The door must fit inside its wall.");
  }
  return {
    width,
    length,
    height,
    wallMaterial: material(o.wallMaterial, "Wall"),
    floorMaterial: material(o.floorMaterial, "Floor"),
    ceilingMaterial: material(o.ceilingMaterial, "Ceiling"),
    ...(door ? { door } : {}),
    ...(o.openTop ? { openTop: true } : {}),
  };
}

const slab = (
  id: string,
  role: SceneRole,
  material: SceneMaterial,
  position: Vec3,
  size: Vec3,
): ScenePrimitive => ({
  id,
  shape: "box",
  position,
  size,
  colour: "dark",
  material,
  role,
});

/** One wall, split around a door when it has one. */
function wall(o: RoomOptions, name: RoomWall): ScenePrimitive[] {
  const t = WALL_THICKNESS;
  const alongX = name === "north" || name === "south";
  // Walls along x cover the corners; walls along z sit between them.
  const half = alongX ? o.width / 2 + t : o.length / 2;
  const across =
    (name === "north" || name === "west" ? -1 : 1) *
    ((alongX ? o.length : o.width) / 2 + t / 2);
  const piece = (
    id: string,
    from: number,
    to: number,
    y0: number,
    y1: number,
  ) => {
    const mid = (from + to) / 2,
      run = to - from,
      tall = y1 - y0;
    const position: Vec3 = alongX
      ? [mid, (y0 + y1) / 2, across]
      : [across, (y0 + y1) / 2, mid];
    const size: Vec3 = alongX ? [run, tall, t] : [t, tall, run];
    return slab(id, "wall", o.wallMaterial, position, size);
  };
  const id = `room-wall-${name}`;
  const door = o.door?.wall === name ? o.door : undefined;
  if (!door) return [piece(id, -half, half, 0, o.height)];
  const left = door.offset - door.width / 2,
    right = door.offset + door.width / 2;
  const parts: ScenePrimitive[] = [];
  if (left + half > 0.01)
    parts.push(piece(`${id}-a`, -half, left, 0, o.height));
  if (half - right > 0.01)
    parts.push(piece(`${id}-b`, right, half, 0, o.height));
  if (o.height - door.height > 0.01)
    parts.push(piece(`${id}-lintel`, left, right, door.height, o.height));
  return parts;
}

export function roomBox(options: RoomOptions): ScenePrimitive[] {
  const o = parseRoomOptions(options);
  const t = WALL_THICKNESS;
  const plan: Vec3 = [o.width + 2 * t, t, o.length + 2 * t];
  return [
    slab("room-floor", "floor", o.floorMaterial, [0, -t / 2, 0], plan),
    ...(o.openTop
      ? []
      : [
          slab(
            "room-ceiling",
            "ceiling",
            o.ceilingMaterial,
            [0, o.height + t / 2, 0],
            plan,
          ),
        ]),
    ...ROOM_WALLS.flatMap((name) => wall(o, name)),
  ];
}
