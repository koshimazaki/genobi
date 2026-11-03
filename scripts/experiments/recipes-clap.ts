/**
 * The clapping studies: two sides of a space that come almost together on
 * each bass hit and spring apart, framed to match the owner's stills.
 */
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneTransform,
  SceneVector,
} from "../../src/world-builder/scene-state";
import { mapping, sized } from "./recipe-parts";
import { bandBlend, interiorRoom, type RoomDesign } from "./recipes-rooms";

/** "Walls closing like clapping": the sides close to 0.25 of their open distance. */
export const CLAP_FRACTION = 0.25;

/**
 * The closed layout is the open one squeezed in x about the street's centre
 * line, sizes included, so two pieces that did not touch open never touch
 * closed and the centre line stays empty.
 */
export function squeezeX(open: SceneTransform[], fraction = CLAP_FRACTION) {
  return open.map((part) => ({
    ...part,
    x: part.x * fraction,
    scaleX: Math.max(0.1, (part.scaleX ?? 1) * fraction),
  }));
}

const box = (
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  extra: Partial<SceneTransform> = {},
): SceneTransform => ({ x, y, z, ...sized(w, h, d), ...extra });

/** Street geometry: x across, z along the street, the camera looks down -z. */
export const STREET = {
  /** Tower centres either side of the street, and their footprint. */
  rowX: 18.4,
  towerWidth: 14,
  towerLength: 14,
  towerZ: [-84, -62, -40, -18, 4],
  towerHeight: 60,
  floors: 6,
  /** The cathedral: facade at frontZ facing up the frame, apse at backZ. */
  frontZ: -12,
  backZ: 16,
} as const;

/** Ten glass towers (six slabs each) and a 36-piece gothic cathedral. */
export function towerStreet(): SceneTransform[] {
  const s = STREET,
    out: SceneTransform[] = [];
  const slab = s.towerHeight / s.floors;
  for (const side of [-1, 1])
    for (const z of s.towerZ)
      for (let f = 0; f < s.floors; f++)
        out.push(
          box(
            side * s.rowX,
            (f + 0.5) * slab,
            z,
            s.towerWidth,
            slab * 0.97,
            s.towerLength,
          ),
        );
  const length = s.backZ - s.frontZ,
    bay = length / 4;
  for (const side of [-1, 1]) {
    for (let b = 0; b < 4; b++) {
      const z = s.frontZ + bay * (b + 0.5);
      // Clerestory wall, aisle roof and nave roof slope for this bay.
      out.push(box(side * 4.2, 8, z, 0.6, 16, bay * 0.96));
      out.push(
        box(side * 5.8, 8.6, z, 3.6, 0.4, bay * 0.96, {
          rotationZ: side * -0.35,
        }),
      );
      out.push(
        box(side * 2.2, 17.4, z, 4.9, 0.4, bay * 0.98, {
          rotationZ: side * -0.62,
        }),
      );
    }
    // Pinnacles along the aisle wall.
    for (let p = 0; p < 3; p++)
      out.push(box(side * 7.2, 6, s.frontZ + 6 + p * 10, 1, 12, 1));
    // The two west towers and their spires.
    out.push(box(side * 5, 15, s.frontZ, 4, 30, 4));
    out.push(box(side * 5, 33, s.frontZ, 1.6, 6, 1.6));
  }
  // The facade wall between the towers, and the apse.
  out.push(box(0, 11, s.frontZ - 0.5, 6, 22, 1));
  out.push(box(0, 9, s.backZ + 2, 9, 18, 4));
  return out;
}

/**
 * Seen from high above, the tower rows fill the left and right of the frame
 * and the cathedral lies in the street below; the camera descends towards the
 * facade while the rows clap together on the bass and spring apart.
 */
export const DESCENT = {
  start: {
    position: [0, 88, 24] as SceneVector,
    target: [0, 0, -23] as SceneVector,
  },
  end: {
    position: [0, 42, -2] as SceneVector,
    target: [0, 0, -28] as SceneVector,
  },
  fov: 42,
};

export function towersDescent(recipe: Recipe): RoomDesign {
  const motion = recipe.motion!;
  const open = towerStreet(),
    closed = squeezeX(open);
  motion.instances!.count = open.length;
  motion.instances!.size = 1;
  motion.instances!.palette = ["#a7b7bb", "#8ca5b2", "#9fb4c0", "#b49c82"];
  const room = {
    dimensions: [18, 60, 70] as SceneVector,
    listener: [0, 1.7, 0] as SceneVector,
  };
  bandBlend(recipe, "Tower street", open, closed, room);
  motion.room = interiorRoom("street-proxy", room.dimensions, room.listener);
  motion.mappings = [mapping("width", "low", "roomWidth", -4)];
  const last = recipe.frames - 1;
  recipe.cameraMotion = {
    version: 1,
    enabled: true,
    keys: [
      { id: "high", frame: 0, ...DESCENT.start },
      { id: "low", frame: last, ...DESCENT.end },
    ].map((key) => ({
      ...key,
      fov: DESCENT.fov,
      easing: "easeInOut" as const,
    })),
    audio: { enabled: false, source: "low", amount: 0, motion: "push" },
  };
  recipe.depthFar = 160;
  recipe.prompt =
    "Seen from high above, two rows of Manhattan glass office towers at golden hour close in toward the street and open again on the beat while the camera descends between them toward a gothic cathedral facade below. Warm reflections in the glass, hard afternoon light, no people.";
  return {
    indoorFromFrame: null,
    design: {
      camera: `looking almost straight down the street, descending from ${DESCENT.start.position.join(", ")} to ${DESCENT.end.position.join(", ")}, ${DESCENT.fov} degree lens`,
      street: `${open.length} pieces: ten ${STREET.towerHeight} m towers in two rows at x ±${STREET.rowX}, a gothic cathedral in the street`,
      close: `blend: morphControl open -> closed on low, the whole street squeezed to ${CLAP_FRACTION} in x`,
      roomSign: "negative: the street proxy narrows on the same bars",
    },
  };
}
