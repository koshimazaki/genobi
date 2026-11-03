/**
 * The clapping studies: two sides of a space that come almost together on
 * each bass hit and spring apart, framed to match the owner's stills.
 */
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneTransform,
  SceneVector,
} from "../../src/world-builder/scene-state";
import { heldCamera, mapping, sized } from "./recipe-parts";
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

/** A piece of the gallery nave and whether it lines a side of the nave. */
interface NavePiece {
  part: SceneTransform;
  side: boolean;
}

/**
 * The owner's gallery nave, seen from the west gallery: six bays of tall piers
 * with pointed arcade heads and a gallery ledge, outer aisle walls, a far wall
 * with three pointed arches and three tall windows, two blocks of pews, an
 * altar with four candle columns, and the vault ribs high above the camera.
 */
export function galleryNave(): NavePiece[] {
  const out: NavePiece[] = [];
  const add = (side: boolean, part: SceneTransform) => out.push({ part, side });
  const bays = [-10, -5, 0, 5, 10, 15];
  for (const s of [-1, 1]) {
    for (const z of bays) {
      add(true, box(s * 9, 15, z, 1.4, 30, 1.4));
      add(true, box(s * 14, 15, z, 0.6, 30, 5));
    }
    for (let b = 0; b < bays.length - 1; b++) {
      const mid = (bays[b] + bays[b + 1]) / 2;
      // Pointed arcade head: two slabs leaning together over the bay.
      for (const lean of [-1, 1])
        add(
          true,
          box(s * 9, 11.2, mid + lean * 1.15, 1.2, 0.6, 3, {
            rotationX: lean * 0.62,
          }),
        );
      add(true, box(s * 9, 17, mid, 1.2, 0.5, 3.6));
    }
  }
  // Far wall: four posts, three pointed heads, the wall above, three windows.
  const wallZ = -11.5;
  for (const x of [-7.2, -2.6, 2.6, 7.2])
    add(false, box(x, 4.5, wallZ, 1.6, 9, 1));
  for (const x of [-4.9, 0, 4.9])
    for (const lean of [-1, 1])
      add(
        false,
        box(x + lean * 0.95, 9.6, wallZ, 2.4, 0.5, 1, {
          rotationZ: lean * -0.62,
        }),
      );
  add(false, box(0, 20.5, wallZ - 0.3, 18, 21, 1));
  for (const x of [-4.9, 0, 4.9])
    add(false, box(x, 23, wallZ + 0.3, 2.4, 9, 0.2));
  // Pews: two blocks of five rows; the altar on its platform with columns.
  for (const s of [-1, 1])
    for (let r = 0; r < 5; r++)
      add(false, box(s * 3.2, 0.5, -7.2 + r * 1.6, 5.4, 1, 0.9));
  add(false, box(0, 0.15, 7.9, 5, 0.3, 5));
  add(false, box(0, 0.85, 7.9, 2.6, 1.1, 1.2));
  for (const x of [-2.5, 2.5])
    for (const z of [5.5, 10.3]) add(false, box(x, 0.7, z, 0.6, 1.4, 0.6));
  // Vault ribs across the nave, well above the gallery.
  for (const z of bays) add(false, box(0, 31, z, 18, 0.6, 0.8));
  return out;
}

/**
 * The grow close: a side piece keeps its outer face and thickens inwards
 * until its inner face is at `fraction` of its open distance; the rest of the
 * nave (pews, altar, far wall, ribs) is squeezed in x by the same fraction.
 */
export function growInward(
  pieces: NavePiece[],
  fraction = CLAP_FRACTION,
): SceneTransform[] {
  return pieces.map(({ part, side }) => {
    if (!side) return squeezeX([part], fraction)[0];
    const width = part.scale * (part.scaleX ?? 1),
      centre = Math.abs(part.x),
      sign = Math.sign(part.x);
    const outer = centre + width / 2,
      inner = (centre - width / 2) * fraction;
    const grown = outer - inner;
    return {
      ...part,
      x: sign * (outer - grown / 2),
      scaleX: grown / part.scale,
    };
  });
}

/** The west gallery view of the owner's still; fixed, no audio push. */
export const GALLERY = {
  position: [0, 23, 18] as SceneVector,
  target: [0, 0, -3] as SceneVector,
  fov: 66,
};

export function cathedralGallery(recipe: Recipe, grow = false): RoomDesign {
  const motion = recipe.motion!;
  const pieces = galleryNave(),
    open = pieces.map((p) => p.part),
    closed = grow ? growInward(pieces) : squeezeX(open);
  motion.instances!.count = open.length;
  motion.instances!.size = 1;
  motion.instances!.palette = ["#c9bda4", "#b6aa91", "#d6ccb6", "#a99f8a"];
  const room = {
    dimensions: [28, 30, 30] as SceneVector,
    listener: [0, 1.7, 0] as SceneVector,
  };
  bandBlend(recipe, "Gallery nave", open, closed, room);
  motion.room = interiorRoom("nave-proxy", room.dimensions, room.listener);
  motion.mappings = [mapping("width", "low", "roomWidth", -4)];
  recipe.cameraMotion = heldCamera(
    GALLERY.position,
    GALLERY.target,
    GALLERY.fov,
  );
  recipe.depthFar = 80;
  recipe.prompt = grow
    ? "Seen from a high gallery at one end of a gothic cathedral, the nave below with pews and an altar; on the beat the stone piers and arches swell inward, thickening toward the centre of the nave, and shrink back as the bass fades, stained glass at the far end, soft daylight. Still camera."
    : "Seen from a high gallery at one end of a gothic cathedral, the nave below with pews and an altar, stone piers and arches on both sides closing in toward the centre and opening again on the beat, stained glass at the far end, soft daylight. Still camera.";
  return {
    indoorFromFrame: 0,
    design: {
      camera: `held at the west gallery ${GALLERY.position.join(", ")} looking at ${GALLERY.target.join(", ")}, ${GALLERY.fov} degree lens`,
      nave: `${open.length} pieces: piers, arcade heads, gallery ledges, aisle walls, far wall with three arches and windows, pews, altar, vault ribs`,
      close: grow
        ? `blend: morphControl open -> closed on low, the side stone keeps its outer face and thickens inwards to ${CLAP_FRACTION} of the open gap`
        : `blend: morphControl open -> closed on low, the whole nave squeezed to ${CLAP_FRACTION} in x`,
      roomSign: "negative: the nave proxy narrows on the same bars",
    },
  };
}
