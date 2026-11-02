/** The architectural studies: a city-to-cathedral journey and the held-camera spaces. */
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneRoom,
  SceneTransform,
  SceneVector,
} from "../../src/world-builder/scene-state";
import {
  heldCamera,
  hollowPyramid,
  mapping,
  nave,
  panCamera,
  parts,
  towers,
} from "./recipe-parts";
import { cathedralNave, NAVE_CAMERA } from "./cathedral-nave";

/**
 * Sign of `spread`: evaluate-scene multiplies each piece's offset from
 * `motion.pivot` by (1 + spread). A NEGATIVE amount therefore pulls the pieces
 * towards the pivot as the band rises: loud = closer, quiet = apart. It scales
 * the offset on all three axes (pieces keep their size), so with the pivot on
 * the floor the walls also settle lower as they close. Room mappings add metres
 * to the acoustic box, so a negative amount shrinks it on the same bars.
 */
// -0.3, not -0.5: at -0.5 the pyramid's terraces closed to 0.67 m from the
// floor camera and swallowed the figure at the loudest bar.
export const CLOSE_ON_LOUD = -0.3;

export interface RoomDesign {
  indoorFromFrame: number | null;
  design: Record<string, unknown>;
}

function interiorRoom(
  id: string,
  dimensions: SceneVector,
  listener: SceneVector,
  visible = false,
): SceneRoom {
  return {
    id,
    dimensions,
    center: [0, 0, 0],
    source: [-1, 1.5, -2],
    listener,
    absorption: {
      floor: 0.22,
      ceiling: 0.24,
      north: 0.2,
      south: 0.2,
      east: 0.18,
      west: 0.18,
    },
    seed: 271,
    wallThickness: 0.12,
    visible,
  };
}

/** Three identical states: the timeline never morphs, only the mappings move. */
function heldStates(
  recipe: Recipe,
  label: string,
  objects: ReturnType<typeof parts>,
  room: { dimensions: SceneVector; listener: SceneVector },
) {
  const last = recipe.frames - 1;
  recipe.motion!.stateKeys = [0, 1, 2].map((i) => ({
    id: `space-${i}`,
    label,
    frame: [0, Math.round(last / 2), last][i],
    easing: "easeInOut",
    objects,
    room: structuredClone(room),
  }));
}

/** How far the walls travel at full blend: 0.55 of their open distance. */
export const CLOSED_FRACTION = 0.55;
/** Morph progress per unit of `low`; the auto-gained band's p95 (0.8) closes ~fully. */
export const BLEND_AMOUNT = 1.2;

/**
 * Open and closed layouts that differ only in distance from the centre line,
 * blended by the low band through `morphControl`: progress is a manual
 * baseline of 0 (open) plus low x amount, so the timeline clock never moves the
 * walls and nothing else (height, depth along the axis, size) changes.
 * `stateAudio` cannot do this: it blends from the timeline pair, so the closed
 * state would have to sit on the timeline and the baseline would drift into it.
 */
function bandBlend(
  recipe: Recipe,
  label: string,
  open: SceneTransform[],
  closed: SceneTransform[],
  room: { dimensions: SceneVector; listener: SceneVector },
  closedRoom = room,
) {
  const motion = recipe.motion!;
  motion.stateKeys = [
    { id: "open", frame: 0, objects: parts(open), room },
    {
      id: "closed",
      frame: recipe.frames - 1,
      objects: parts(closed),
      room: closedRoom,
    },
  ].map((key) => ({
    ...key,
    label: `${label} (${key.id})`,
    easing: "linear" as const,
    room: structuredClone(key.room),
  }));
  motion.transitionStyle = "direct";
  motion.intensity = 1;
  motion.morphControl = {
    version: 1,
    enabled: true,
    originStateId: "open",
    progress: {
      mode: "manual",
      position: 0,
      source: "low",
      amount: BLEND_AMOUNT,
    },
    // The target never changes: one fixed stop, no audio on the target axis.
    target: {
      position: 0,
      amount: 0,
      mode: "blend",
      routes: [{ stateId: "closed", source: "low", amount: 1, enabled: false }],
    },
  };
}

export function falling(recipe: Recipe, cathedralOnly = false): number {
  const last = recipe.frames - 1,
    entry = Math.round(last / 2);
  const motion = recipe.motion!;
  const church = nave(),
    party = nave().map((part) => ({
      ...part,
      x: part.x * 0.6,
      y: part.y * 0.2,
      z: part.z * 0.5,
      scaleX: (part.scaleX ?? 1) * 0.6,
      scaleY: Math.max(0.1, (part.scaleY ?? 1) * 0.2),
      scaleZ: Math.max(0.1, (part.scaleZ ?? 1) * 0.5),
    }));
  const dims: SceneVector[] = [
    [28, 24, 32],
    [20, 24, 32],
    [12, 5, 16],
  ];
  const listeners: SceneVector[] = [
    [0, 20, 10],
    [0, 20, 10],
    [0, 2.8, 6],
  ];
  motion.instances!.count = 96;
  motion.instances!.size = 1;
  motion.instances!.palette = ["#a7b7bb", "#d1c5ac", "#8ca5b2", "#b49c82"];
  const layouts = cathedralOnly
    ? [church, church, church]
    : [towers(96, true), church, party];
  if (cathedralOnly) {
    // One nave throughout: its width and depth breathe with the bass, the
    // vault lifts on the voice; the camera holds the elevated nave view.
    dims[0] = dims[2] = dims[1];
    listeners[0] = listeners[2] = listeners[1];
  }
  motion.stateKeys = layouts.map((layout, i) => ({
    id: `space-${i}`,
    label: cathedralOnly
      ? "Cathedral proxy"
      : ["City towers", "Cathedral proxy", "Party room"][i],
    frame: [0, entry, last][i],
    easing: "easeInOut",
    objects: parts(layout),
    room: { dimensions: dims[i], listener: listeners[i] },
  }));
  motion.room = interiorRoom("interior-proxy", dims[0], listeners[0]);
  motion.mappings = [
    mapping("walls", "low", "spread", 0.025),
    mapping("height", "mid", "roomHeight", 0.2),
  ];
  motion.intensity = 0.7;
  recipe.depthFar = 160;
  if (cathedralOnly) {
    motion.mappings = [
      mapping("width", "low", "roomWidth", 1.0),
      mapping("depth", "low", "roomDepth", 0.6),
      mapping("vault", "mid", "roomHeight", 0.5),
      // The room box is invisible; the piers are what the eye sees, so the
      // bass pushes them apart (the distance between the buildings).
      mapping("walls", "low", "spread", 0.12),
    ];
    recipe.cameraMotion = {
      version: 1,
      enabled: true,
      keys: [
        {
          id: "nave-a",
          frame: 0,
          position: [0, 21, 15],
          target: [0, 0, -3],
          fov: 66,
          easing: "easeInOut",
        },
        {
          id: "nave-b",
          frame: last,
          position: [0, 19, 11],
          target: [0, 0, -3],
          fov: 66,
          easing: "easeInOut",
        },
      ],
      audio: { enabled: true, source: "low", amount: 0.2, motion: "push" },
    };
    recipe.prompt =
      "An elevated view down a tall gothic cathedral nave towards the altar, stone piers and vaults breathing gently with the music. Warm stone, stained glass light on the floor.";
    return entry;
  }
  recipe.cameraMotion = {
    version: 1,
    enabled: true,
    keys: [
      {
        id: "sky",
        frame: 0,
        position: [0, 68, 20],
        target: [0, 10, -5],
        fov: 64,
        easing: "easeInOut",
      },
      {
        id: "nave",
        frame: entry,
        position: [0, 20, 10],
        target: [0, 1, -12],
        fov: 62,
        easing: "easeInOut",
      },
      {
        id: "party",
        frame: last,
        position: [0, 2.8, 6],
        target: [0, 2, -6],
        fov: 64,
        easing: "easeInOut",
      },
    ],
    audio: { enabled: true, source: "low", amount: 0.35, motion: "push" },
  };
  recipe.prompt =
    "A descending camera moves between towers into a tall cathedral and a compact party room. Preserve the authored camera and changing structure. Warm stone, cool glass and restrained luminous detail.";
  return entry;
}

/** The nave with the camera held in the gallery: the walls do the moving. */
export function cathedralWalls(recipe: Recipe): RoomDesign {
  falling(recipe, true);
  const open = cathedralNave(1),
    closed = cathedralNave(CLOSED_FRACTION);
  recipe.motion!.instances!.count = open.length;
  bandBlend(recipe, "Nave", open, closed, {
    dimensions: [22, 21, 28],
    listener: [0, 12, 12],
  });
  recipe.motion!.mappings = [
    mapping("width", "low", "roomWidth", -4),
    mapping("depth", "low", "roomDepth", -4),
    mapping("vault", "mid", "roomHeight", -0.8),
  ];
  // A closed vault would roof over a high gallery view, so the camera holds a
  // west-end loft below the vault, looking down the nave to the apse window.
  recipe.cameraMotion = heldCamera(
    NAVE_CAMERA.position,
    NAVE_CAMERA.target,
    NAVE_CAMERA.fov,
  );
  recipe.prompt =
    "A still view from the west loft down a tall gothic cathedral nave to the pointed window of the apse. The clustered columns and pointed arches slide in towards the aisle on the loud beats and back out in the quiet, under a ribbed stone vault. Warm stone, stained glass light on a pale floor.";
  return {
    indoorFromFrame: 0,
    design: {
      camera: "held at the west-end loft below the vault, no audio push",
      nave: `${open.length} pieces: clustered columns, pointed arcade, clerestory, side aisles, ribbed vault with a ridge, apse wall with a pointed window, floor`,
      close:
        "blend: morphControl open -> closed on low, the whole nave narrows in x; heights and the ridge hold",
      closedFraction: CLOSED_FRACTION,
      blendAmount: BLEND_AMOUNT,
      roomSign: "negative: the acoustic box shrinks on the same bars",
    },
  };
}

/** Two rows of towers seen like a drone looking down the street between them. */
export function canyon(recipe: Recipe): RoomDesign {
  const motion = recipe.motion!;
  motion.instances!.count = 96;
  motion.instances!.size = 1;
  motion.instances!.palette = ["#a7b7bb", "#d1c5ac", "#8ca5b2", "#b49c82"];
  // The street runs along x between the rows at z = -12 and z = +12, so the
  // distance from its centre line is z.
  const open = towers(96, true),
    closed = open.map((part) => ({ ...part, z: part.z * CLOSED_FRACTION }));
  const room = {
    dimensions: [32, 38, 19] as SceneVector,
    listener: [0, 1.7, 0] as SceneVector,
  };
  bandBlend(recipe, "Street", open, closed, room);
  motion.room = interiorRoom("street-proxy", room.dimensions, room.listener);
  motion.mappings = [
    mapping("width", "low", "roomWidth", -4),
    mapping("depth", "low", "roomDepth", -4),
  ];
  // High and well back, so all four towers of each row line the street.
  recipe.cameraMotion = heldCamera([-50, 62, 0], [6, 6, 0], 50);
  recipe.depthFar = 160;
  recipe.prompt =
    "A still drone shot looking down a long city street between two rows of tall glass towers. The two rows slide in and the street narrows on the loud beats, then opens again. Clean pale asphalt, soft daylight, long shadows.";
  return {
    indoorFromFrame: null,
    design: {
      camera: "held drone view down the street, no audio push",
      close: "blend: morphControl open -> closed on low, z only",
      closedFraction: CLOSED_FRACTION,
      blendAmount: BLEND_AMOUNT,
      roomSign: "negative: the street proxy box shrinks on the same bars",
    },
  };
}

/** An empty small room whose size alone follows the bass, a dancer at its centre. */
export function roomWalls(recipe: Recipe): RoomDesign {
  const motion = recipe.motion!;
  // No furniture at all: every apartment piece is hidden (presence 0).
  const empty = Object.fromEntries(
    Object.entries(motion.stateKeys[0].objects).map(([id, part]) => [
      id,
      { ...part, presence: 0 },
    ]),
  );
  // About 0.6 of the apartment's open room (8 x 3.4 x 6.5), height kept at
  // 2.6 m so the dancer clears the ceiling line.
  const room = {
    dimensions: [4.8, 2.6, 3.9] as SceneVector,
    listener: [0, 1.6, 1.2] as SceneVector,
  };
  heldStates(recipe, "Small room", empty, room);
  motion.room = {
    ...motion.room!,
    dimensions: room.dimensions,
    listener: room.listener,
    visible: true,
    // The cutaway hides the south wall (behind the camera) and the ceiling, so
    // a wall that closes past the lens can never blank the frame.
    cutaway: true,
  };
  motion.intensity = 1;
  // At full bass the room is 2.8 x 2.3 m: the walls 1.4 m from the dancer.
  motion.mappings = [
    mapping("width", "low", "roomWidth", -2),
    mapping("depth", "low", "roomDepth", -1.6),
    mapping("height", "mid", "roomHeight", -0.3),
  ];
  recipe.avatar = true;
  recipe.avatarAsset = "mannequin";
  recipe.avatarMotion = "dance";
  recipe.avatarPose = { x: 0, y: 0, z: -0.3, yaw: 0 };
  // Eye height, 2.1 m from the dancer so the whole figure is in frame.
  recipe.cameraMotion = heldCamera([0, 1.6, 1.8], [0, 1.1, -2], 75);
  recipe.depthFar = 20;
  recipe.prompt =
    "A still eye-level shot of a person dancing alone in a small bare room. The walls slide in around them on the loud beats until it is cramped, then fall back in the quiet. Bare plaster walls, a single warm lamp, an uneasy late-night mood.";
  return {
    indoorFromFrame: 0,
    design: {
      camera: "held at eye height inside the room",
      room: "empty, 4.8 x 2.6 x 3.9 m, visible with cutaway",
      roomSign: "negative: loud = walls closer, the box shrinks",
      avatar: "mannequin, dance, centre",
    },
  };
}

/** How big the interior is: three times the base hollow pyramid (36 m tall). */
export const PYRAMID_SCALE = 3;
/** The pyramid's terraces close to 0.7 of their open distance at full bass. */
export const PYRAMID_CLOSED = 0.7;

/**
 * A big hollow stepped pyramid seen from the floor with a wide lens. The room
 * box can only be a rectangle, so the visible enclosure is the terraced walls
 * (double-sided slabs read from inside) and a hidden box carries the reverb.
 * Walls and box close together through the same open -> closed blend: the
 * terraces move inwards (x and z) at their own height, and the closed state's
 * room box is smaller by the same fraction.
 */
export function pyramidInside(recipe: Recipe): RoomDesign {
  const motion = recipe.motion!;
  motion.instances!.size = 1;
  const open = hollowPyramid(PYRAMID_SCALE),
    closed = open.map((part) => ({
      ...part,
      x: part.x * PYRAMID_CLOSED,
      z: part.z * PYRAMID_CLOSED,
    }));
  const listener: SceneVector = [0, 1.3, 2];
  // Roughly the interior volume: a third of 38.4 m x 38.4 m x 36 m.
  const dimensions: SceneVector = [32, 18, 32];
  bandBlend(
    recipe,
    "Pyramid interior",
    open,
    closed,
    { dimensions, listener },
    {
      dimensions: [32 * PYRAMID_CLOSED, 18, 32 * PYRAMID_CLOSED],
      listener,
    },
  );
  motion.room = interiorRoom("pyramid-proxy", dimensions, listener);
  motion.mappings = [];
  recipe.avatar = true;
  recipe.avatarAsset = "mannequin";
  recipe.avatarMotion = "idle";
  // On the floor 7 m ahead, inside the base even at full close (13.4 m).
  recipe.avatarPose = { x: 1.2, y: 0, z: -5, yaw: 0 };
  // Near the floor with a wide lens, panning 45 degrees, looking up and across.
  recipe.cameraMotion = panCamera(
    [0, 1, 2],
    [0, 9, -18],
    45,
    85,
    recipe.frames - 1,
  );
  recipe.depthFar = 120;
  recipe.prompt =
    "From the floor of a vast stepped stone pyramid, a wide view up the towering terraces to the open apex, a lone figure standing small on the floor. The terraced walls close in on the loud beats and open in the quiet. Warm sandstone, a shaft of daylight from the oculus, dust in the air.";
  return {
    indoorFromFrame: 0,
    design: {
      camera: "near the floor, 85 degree lens, a slow 45 degree pan looking up",
      enclosure: `hollow stepped pyramid x${PYRAMID_SCALE} (36 m tall), 128 wall pieces; room box hidden`,
      close: `blend: morphControl open -> closed on low, terraces to ${PYRAMID_CLOSED} in x and z`,
      roomSign: "the closed state's reverb box is smaller by the same fraction",
      avatar: "mannequin, idle",
    },
  };
}
