import type { Prop } from "./recipe";
import {
  ROOM_FACES,
  type RoomFace,
  type SceneRoom,
  type SceneVector,
} from "./scene-state";

export const ROOM_DIMENSION_RANGE = [1, 32] as const;
export const ROOM_MARGIN = 0.05;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(v, hi));

export function roomPointInside(point: SceneVector, dimensions: SceneVector) {
  const [w, h, d] = dimensions;
  return (
    point[0] >= -w / 2 + ROOM_MARGIN &&
    point[0] <= w / 2 - ROOM_MARGIN &&
    point[1] >= ROOM_MARGIN &&
    point[1] <= h - ROOM_MARGIN &&
    point[2] >= -d / 2 + ROOM_MARGIN &&
    point[2] <= d / 2 - ROOM_MARGIN
  );
}

/** Audio compression is bounded; a source never leaves its acoustic enclosure. */
export function clampRoomPoint(
  point: SceneVector,
  dimensions: SceneVector,
): SceneVector {
  const [w, h, d] = dimensions;
  return [
    clamp(point[0], -w / 2 + ROOM_MARGIN, w / 2 - ROOM_MARGIN),
    clamp(point[1], ROOM_MARGIN, h - ROOM_MARGIN),
    clamp(point[2], -d / 2 + ROOM_MARGIN, d / 2 - ROOM_MARGIN),
  ];
}

export function roomSurfaceId(room: Pick<SceneRoom, "id">, face: RoomFace) {
  return `scene-room-${room.id}-${face}`;
}

/** All six physical surfaces, including those hidden by a cutaway view. */
export function roomSurfaces(room: SceneRoom): Prop[] {
  const [w, h, d] = room.dimensions,
    [cx, cy, cz] = room.center;
  const t = room.wallThickness;
  const surfaces: Record<
    RoomFace,
    [number, number, number, number, number, number]
  > = {
    floor: [cx, cy - t / 2, cz, w + 2 * t, t, d + 2 * t],
    ceiling: [cx, cy + h + t / 2, cz, w + 2 * t, t, d + 2 * t],
    north: [cx, cy + h / 2, cz - d / 2 - t / 2, w, h, t],
    south: [cx, cy + h / 2, cz + d / 2 + t / 2, w, h, t],
    east: [cx + w / 2 + t / 2, cy + h / 2, cz, t, h, d],
    west: [cx - w / 2 - t / 2, cy + h / 2, cz, t, h, d],
  };
  return ROOM_FACES.map((face) => {
    const [x, y, z, sx, sy, sz] = surfaces[face];
    return {
      id: roomSurfaceId(room, face),
      shape: "box",
      x,
      y,
      z,
      scale: 1,
      scaleX: sx,
      scaleY: sy,
      scaleZ: sz,
      spin: 0,
      color: face === "floor" ? "#52625a" : "#8a9d89",
      prompt: `Acoustic ${face}; absorption ${room.absorption[face]}`,
    };
  });
}
