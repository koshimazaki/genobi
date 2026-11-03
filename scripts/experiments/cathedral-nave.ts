/**
 * A gothic nave of 146 pieces, built for a given span: `f` = 1 is open, a
 * smaller `f` narrows the nave and aisles sideways only (x), while heights,
 * bay spacing and the vault ridge stay put. Rib angles and lengths are
 * recomputed for each span, so the vault still meets at its ridge.
 *
 * Axes: the nave runs along z from the apse wall (z = -15) to the west end
 * (z = +11); x is across it. Box sizes are metres (instance size 1), passed
 * through `sized` so long pieces stay inside the engine's per-axis bounds.
 */
import type { SceneTransform } from "../../src/world-builder/scene-state";
import { sized } from "./recipe-parts";

const BAYS = 6,
  BAY = 4,
  FIRST = -13;
const PIER_TOP = 12,
  ARCH_APEX = 15,
  SPRING = 17,
  RIDGE = 21,
  AISLE_EAVE = 10,
  APSE_Z = -15;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function cathedralNave(f = 1): SceneTransform[] {
  const W = 7 * f, // the arcade (nave columns) from the centre line
    A = 11 * f; // the aisle outer walls
  const out: SceneTransform[] = [];
  const box = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    turn: { rotationX?: number; rotationZ?: number } = {},
  ) =>
    out.push({
      x: r3(x),
      y: r3(y),
      z: r3(z),
      ...sized(sx, sy, sz),
      ...(turn.rotationX ? { rotationX: r3(turn.rotationX) } : {}),
      ...(turn.rotationZ ? { rotationZ: r3(turn.rotationZ) } : {}),
    });
  const lines = Array.from({ length: BAYS + 1 }, (_, k) => FIRST + k * BAY);
  for (const s of [-1, 1]) {
    // Clustered columns: a main shaft and two slender shafts along the arcade.
    for (const z of lines) {
      box(s * W, PIER_TOP / 2, z, 1, PIER_TOP, 1);
      for (const dz of [-0.6, 0.6])
        box(s * W, (PIER_TOP + 1) / 2, z + dz, 0.4, PIER_TOP + 1, 0.4);
    }
    for (const z of lines.slice(0, -1)) {
      const mid = z + BAY / 2;
      // A pointed arch between neighbouring piers: two halves meeting at the apex.
      const rise = ARCH_APEX - PIER_TOP,
        half = BAY / 2;
      const length = Math.hypot(rise, half),
        tilt = Math.atan2(rise, half);
      const y = (PIER_TOP + ARCH_APEX) / 2;
      box(s * W, y, z + half / 2, 0.6, 0.5, length, { rotationX: -tilt });
      box(s * W, y, mid + half / 2, 0.6, 0.5, length, { rotationX: tilt });
      // Clerestory wall from the arch apex up to the vault springing.
      box(s * W, (ARCH_APEX + SPRING) / 2, mid, 0.4, SPRING - ARCH_APEX, BAY);
      // Side aisle: outer wall and a lean-to roof up to the arcade.
      box(s * A, AISLE_EAVE / 2, mid, 0.4, AISLE_EAVE, BAY);
      const run = A - W,
        roofRise = PIER_TOP - AISLE_EAVE;
      box(
        (s * (A + W)) / 2,
        (AISLE_EAVE + PIER_TOP) / 2,
        mid,
        Math.hypot(run, roofRise),
        0.25,
        BAY,
        { rotationZ: -s * Math.atan2(roofRise, run) },
      );
      // Vault web: one panel per bay per side, from the springing to the ridge.
      box(
        (s * W) / 2,
        (SPRING + RIDGE) / 2 + 0.2,
        mid,
        Math.hypot(W, RIDGE - SPRING),
        0.15,
        BAY,
        { rotationZ: -s * Math.atan2(RIDGE - SPRING, W) },
      );
    }
    // Transverse ribs on every column line, meeting at the ridge.
    for (const z of lines)
      box(
        (s * W) / 2,
        (SPRING + RIDGE) / 2,
        z,
        Math.hypot(W, RIDGE - SPRING),
        0.5,
        0.5,
        { rotationZ: -s * Math.atan2(RIDGE - SPRING, W) },
      );
  }
  // The ridge rib, bay by bay, and the nave floor.
  for (const z of lines.slice(0, -1)) box(0, RIDGE, z + BAY / 2, 0.5, 0.5, BAY);
  for (const z of lines.slice(0, -1))
    box(0, 0.05, z + BAY / 2, 2 * W, 0.1, BAY);
  box(0, 0.05, (APSE_Z + FIRST) / 2, 2 * A, 0.1, FIRST - APSE_Z);
  // The apse wall with one tall pointed window: two jambs, a head, a lintel.
  const w = 1.6 * f,
    sill = 13,
    point = 16,
    top = RIDGE;
  for (const s of [-1, 1]) {
    box((s * (A + w)) / 2, top / 2, APSE_Z, A - w, top, 0.6);
    // The window head, thick enough to fill the spandrel above its slope.
    const length = Math.hypot(w, point - sill),
      lean = Math.atan2(point - sill, w);
    // The upward normal of each slope points away from the centre line.
    const nx = (s * (point - sill)) / length,
      ny = w / length;
    box(
      (s * w) / 2 + nx * 1.2,
      (sill + point) / 2 + ny * 1.2,
      APSE_Z,
      length,
      2.4,
      0.6,
      { rotationZ: -s * lean },
    );
  }
  box(0, (point + top) / 2, APSE_Z, 2 * w, top - point, 0.6);
  return out;
}

/** The held view: a west-end loft below the vault, looking down the nave. */
export const NAVE_CAMERA = {
  position: [0, 12, 15] as [number, number, number],
  target: [0, 7, -14] as [number, number, number],
  fov: 66,
};
