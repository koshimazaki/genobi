/**
 * The room's six interior faces from its wall, floor and ceiling boxes. A
 * boundary role and the nearest room edge determine each slab's normal;
 * the interior runs between the inner faces of the slabs on either side.
 * Each face records the area each material covers and the rest, an opening
 * (a door, an open top).
 */
import type { Bounds } from "./bounds";
import { primitiveBounds } from "./bounds";
import type { SceneMaterial, ScenePrimitive, Vec3 } from "./types";

export interface Face {
  name: string;
  axis: 0 | 1 | 2;
  /** The face's coordinate along `axis`. */
  plane: number;
  areaM2: number;
  covered: Map<SceneMaterial, number>;
  openingM2: number;
}

const NAMES = [
  ["west wall", "east wall"],
  ["floor", "ceiling"],
  ["north wall", "south wall"],
] as const;

export function interiorFaces(
  boundaries: readonly ScenePrimitive[],
  outer: Bounds,
): { interior: Bounds; list: Face[] } | null {
  const slabs = boundaries.map((p) => {
    const b = primitiveBounds(p);
    // Floors/ceilings stay horizontal. A wall's normal points toward its
    // nearest room boundary: a thin lintel or door pier is still a wall.
    // The extent breaks ties at corners, where both outer edges can meet.
    const gap = (axis: number) =>
      Math.min(
        Math.abs(b.min[axis] - outer.min[axis]),
        Math.abs(b.max[axis] - outer.max[axis]),
      );
    const axes = [0, 2] as const;
    const axis: 0 | 1 | 2 =
      p.role === "floor" || p.role === "ceiling"
        ? 1
        : [...axes].sort((a, c) => {
            const difference = gap(a) - gap(c);
            return Math.abs(difference) > 1e-6
              ? difference
              : b.max[a] - b.min[a] - (b.max[c] - b.min[c]);
          })[0];
    return { p, b, axis };
  });
  const centre = outer.min.map((v, i) => (v + outer.max[i]) / 2);
  const side = (s: (typeof slabs)[number], sign: -1 | 1) =>
    (s.b.min[s.axis] + s.b.max[s.axis]) / 2 < centre[s.axis]
      ? sign === -1
      : sign === 1;
  const min = [0, 1, 2].map((a) => {
    const list = slabs.filter((s) => s.axis === a && side(s, -1));
    return list.length
      ? Math.max(...list.map((s) => s.b.max[a]))
      : outer.min[a];
  }) as Vec3;
  const max = [0, 1, 2].map((a) => {
    const list = slabs.filter((s) => s.axis === a && side(s, 1));
    return list.length
      ? Math.min(...list.map((s) => s.b.min[a]))
      : outer.max[a];
  }) as Vec3;
  if (max.some((v, i) => v - min[i] < 0.1)) return null;
  const interior = { min, max };
  const list: Face[] = [];
  for (const axis of [0, 1, 2] as const)
    for (const sign of [-1, 1] as const) {
      const [b, c] = [0, 1, 2].filter((i) => i !== axis);
      const area = (max[b] - min[b]) * (max[c] - min[c]);
      const covered = new Map<SceneMaterial, number>();
      let total = 0;
      for (const s of slabs.filter((s) => s.axis === axis && side(s, sign))) {
        const overlap = (i: number) =>
          Math.max(
            0,
            Math.min(max[i], s.b.max[i]) - Math.max(min[i], s.b.min[i]),
          );
        const part = overlap(b) * overlap(c);
        if (part <= 0) continue;
        const material = s.p.material ?? "plaster";
        covered.set(material, (covered.get(material) ?? 0) + part);
        total += part;
      }
      // Overlapping slabs cannot cover more than the face.
      if (total > area)
        for (const [m, v] of covered) covered.set(m, (v * area) / total);
      list.push({
        name: NAMES[axis][sign === -1 ? 0 : 1],
        axis,
        plane: sign === -1 ? min[axis] : max[axis],
        areaM2: area,
        covered,
        openingM2: area - total > 1e-6 ? area - total : 0,
      });
    }
  return { interior, list };
}
