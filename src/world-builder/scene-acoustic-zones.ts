import { WORLD_POSITION_LIMIT } from "./scene-bounds";
import { ROOM_DIMENSION_RANGE, roomPointInside } from "./scene-room";
import { ROOM_FACES, type RoomFace, type SceneVector } from "./scene-state";

interface ZoneBounds {
  id: string;
  label: string;
  /** World centre of the floor, in metres. */
  center: SceneVector;
  /** Width, height and depth in metres. Bounds are authored, never inferred. */
  dimensions: SceneVector;
}
export interface AcousticOpening {
  face: RoomFace;
  /** Open area on the face, in square metres. This is a leakage proxy. */
  areaM2: number;
}
export interface IndoorAcousticZone extends ZoneBounds {
  kind: "room";
  absorption: Record<RoomFace, number>;
  /** Local x/z centred on the room, y above its floor. */
  source: SceneVector;
  seed: number;
  openings?: AcousticOpening[];
}
export interface OutdoorAcousticZone extends ZoneBounds {
  kind: "outdoor";
}
export type SceneAcousticZone = IndoorAcousticZone | OutdoorAcousticZone;
export const MAX_ACOUSTIC_ZONES = 8;
/** Dry detection bounds do not allocate an indoor solver or impulse response. */
export const OUTDOOR_ZONE_DIMENSION_RANGE = [
  1,
  WORLD_POSITION_LIMIT * 2,
] as const;

export function acousticFaceArea(dimensions: SceneVector, face: RoomFace) {
  const [w, h, d] = dimensions;
  return face === "floor" || face === "ceiling"
    ? w * d
    : face === "north" || face === "south"
      ? w * h
      : d * h;
}

const finite = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const vector = (v: unknown, lo: number, hi: number): v is SceneVector =>
  Array.isArray(v) && v.length === 3 && v.every((n) => finite(n, lo, hi));
const failDefault = (message: string): never => {
  throw new Error(message);
};

/** Validate explicit enclosure metadata independently of decorative geometry. */
export function validateSceneAcousticZones(
  input: unknown,
  fail: (message: string) => never = failDefault,
): SceneAcousticZone[] {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > MAX_ACOUSTIC_ZONES
  )
    return fail(`Choose between 1 and ${MAX_ACOUSTIC_ZONES} acoustic zones.`);
  const ids = new Set<string>();
  for (const value of input) {
    if (
      !plain(value) ||
      typeof value.id !== "string" ||
      !/^[a-zA-Z0-9][\w-]{0,47}$/.test(value.id) ||
      ids.has(value.id) ||
      typeof value.label !== "string" ||
      !value.label.trim() ||
      value.label.length > 72 ||
      !vector(value.center, -WORLD_POSITION_LIMIT, WORLD_POSITION_LIMIT) ||
      !vector(
        value.dimensions,
        ...(value.kind === "outdoor"
          ? OUTDOOR_ZONE_DIMENSION_RANGE
          : ROOM_DIMENSION_RANGE),
      ) ||
      !["room", "outdoor"].includes(String(value.kind))
    )
      return fail(
        "Invalid acoustic zone identity, dimensions or world position.",
      );
    ids.add(value.id);
    const allowed = ["id", "label", "kind", "center", "dimensions"];
    if (value.kind === "room") {
      allowed.push("source", "absorption", "seed", "openings");
      if (
        !vector(value.source, -WORLD_POSITION_LIMIT, WORLD_POSITION_LIMIT) ||
        !roomPointInside(value.source, value.dimensions) ||
        !Number.isInteger(value.seed) ||
        !finite(value.seed, 0, 0xffffffff) ||
        !plain(value.absorption) ||
        Object.keys(value.absorption).some(
          (face) => !ROOM_FACES.includes(face as RoomFace),
        ) ||
        ROOM_FACES.some(
          (face) =>
            !finite(
              (value.absorption as Record<string, unknown>)[face],
              0.01,
              0.99,
            ),
        )
      )
        return fail(
          "Acoustic room zones need bounded materials and an interior source.",
        );
      if (value.openings !== undefined) {
        if (!Array.isArray(value.openings) || value.openings.length > 6)
          return fail("Use at most one acoustic opening area per room face.");
        const faces = new Set<RoomFace>();
        for (const opening of value.openings) {
          if (
            !plain(opening) ||
            Object.keys(opening).some(
              (key) => !["face", "areaM2"].includes(key),
            ) ||
            !ROOM_FACES.includes(opening.face as RoomFace) ||
            faces.has(opening.face as RoomFace) ||
            !finite(
              opening.areaM2,
              0,
              acousticFaceArea(value.dimensions, opening.face as RoomFace),
            )
          )
            return fail("Acoustic openings must fit their declared room face.");
          faces.add(opening.face as RoomFace);
        }
      }
    }
    if (Object.keys(value).some((key) => !allowed.includes(key)))
      return fail(
        "Unsupported acoustic zone fields; outdoors has no enclosed-room reverb.",
      );
  }
  return input as SceneAcousticZone[];
}

/** Open area is perfectly absorbing in this single-room proxy, not a portal solver. */
export function acousticZoneAbsorption(zone: IndoorAcousticZone) {
  const absorption = { ...zone.absorption };
  for (const opening of zone.openings ?? []) {
    const share =
      opening.areaM2 / acousticFaceArea(zone.dimensions, opening.face);
    absorption[opening.face] += (1 - absorption[opening.face]) * share;
  }
  return absorption;
}

/** Half-open bounds avoid ambiguous shared floors; smaller nested zones win. */
export function acousticZoneAt(
  zones: readonly SceneAcousticZone[],
  point: SceneVector,
) {
  let selected: SceneAcousticZone | undefined;
  let volume = Infinity;
  for (const zone of zones) {
    const [w, h, d] = zone.dimensions;
    const [x, y, z] = point.map((v, axis) => v - zone.center[axis]);
    const next = w * h * d;
    if (
      x >= -w / 2 &&
      x < w / 2 &&
      y >= 0 &&
      y < h &&
      z >= -d / 2 &&
      z < d / 2 &&
      next < volume
    ) {
      selected = zone;
      volume = next;
    }
  }
  return selected;
}

/** Bake geometry, source positions and aperture areas through the same scale. */
export function scaleAcousticZones(
  zones: readonly SceneAcousticZone[],
  factor: number,
  pivot: SceneVector,
): SceneAcousticZone[] {
  if (!Number.isFinite(factor) || factor <= 0)
    throw new Error("Acoustic zone scale must be positive and finite.");
  const scaled = zones.map((zone) => ({
    ...structuredClone(zone),
    center: zone.center.map(
      (v, axis) => pivot[axis] + (v - pivot[axis]) * factor,
    ),
    dimensions: zone.dimensions.map((v) => v * factor),
    ...(zone.kind === "room"
      ? {
          source: zone.source.map((v) => v * factor),
          ...(zone.openings
            ? {
                openings: zone.openings.map((opening) => ({
                  ...opening,
                  areaM2: opening.areaM2 * factor * factor,
                })),
              }
            : {}),
        }
      : {}),
  }));
  return validateSceneAcousticZones(scaled);
}
