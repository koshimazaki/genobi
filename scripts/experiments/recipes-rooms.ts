/** The architectural studies: a city-to-cathedral journey and the held-camera spaces. */
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneRoom,
  SceneTransform,
  SceneVector,
} from "../../src/world-builder/scene-state";
import { heldCamera, mapping, nave, parts, towers } from "./recipe-parts";

/**
 * Sign of `spread`: evaluate-scene multiplies each piece's offset from
 * `motion.pivot` by (1 + spread). A NEGATIVE amount therefore pulls the pieces
 * towards the pivot as the band rises: loud = closer, quiet = apart. It scales
 * the offset on all three axes (pieces keep their size), so with the pivot on
 * the floor the walls also settle lower as they close. Room mappings add metres
 * to the acoustic box, so a negative amount shrinks it on the same bars.
 */
export const CLOSE_ON_LOUD = -0.5;

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
) {
  const motion = recipe.motion!;
  motion.stateKeys = [
    { id: "open", frame: 0, objects: parts(open) },
    { id: "closed", frame: recipe.frames - 1, objects: parts(closed) },
  ].map((key) => ({
    ...key,
    label: `${label} (${key.id})`,
    easing: "linear" as const,
    room: structuredClone(room),
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
  const open = nave(),
    // Only distance from the centre line (x) changes; ribs and floor slabs
    // narrow with the span so the vault still meets at the ridge.
    closed = open.map((part) => ({
      ...part,
      x: part.x * CLOSED_FRACTION,
      ...(part.scaleX !== undefined && part.scaleX > 1
        ? { scaleX: part.scaleX * CLOSED_FRACTION }
        : {}),
    }));
  bandBlend(recipe, "Nave", open, closed, {
    dimensions: [20, 24, 32],
    listener: [0, 20, 10],
  });
  recipe.motion!.mappings = [
    mapping("width", "low", "roomWidth", -4),
    mapping("depth", "low", "roomDepth", -4),
    mapping("vault", "mid", "roomHeight", -0.8),
  ];
  recipe.cameraMotion = heldCamera([0, 21, 15], [0, 0, -3], 66);
  recipe.prompt =
    "A still, elevated view from the gallery down a tall gothic cathedral nave towards the altar. The rows of stone piers slide in towards the aisle on the loud beats and back out in the quiet. Warm stone, stained glass light on a pale floor.";
  return {
    indoorFromFrame: 0,
    design: {
      camera: "held gallery view, no audio push",
      close: "blend: morphControl open -> closed on low, x only",
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

/** The apartment's own visible room box, closing on the bass around a dancer. */
export function roomWalls(recipe: Recipe): RoomDesign {
  const motion = recipe.motion!;
  // The two full-height partitions would fill the lens from eye height; hide
  // them (presence 0) so the outer walls are what closes in.
  const furniture = Object.fromEntries(
    Object.entries(motion.stateKeys[0].objects).map(([id, part]) => [
      id,
      id === "divider" || id === "cross-wall" ? { ...part, presence: 0 } : part,
    ]),
  );
  const room = {
    dimensions: [8, 3.4, 6.5] as SceneVector,
    listener: [0, 1.6, 1.4] as SceneVector,
  };
  heldStates(recipe, "Closing room", furniture, room);
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
  motion.mappings = [
    mapping("width", "low", "roomWidth", -3),
    mapping("depth", "low", "roomDepth", -2.5),
    mapping("height", "mid", "roomHeight", -0.6),
  ];
  recipe.avatar = true;
  recipe.avatarAsset = "mannequin";
  recipe.avatarMotion = "dance";
  // Open floor between the bed and the table, 3 m from the lens so the whole
  // figure is in frame. The camera sits 1.9 m from centre: inside the box even
  // at the default loudest depth (6.5 - 2.5 = 4 m).
  recipe.avatarPose = { x: 0.1, y: 0, z: -1.2, yaw: 0 };
  recipe.cameraMotion = heldCamera([0, 1.6, 1.9], [0, 1.2, -3], 75);
  recipe.depthFar = 30;
  recipe.prompt =
    "A still eye-level shot inside a small plain room where a person dances alone. The walls slide in towards them on the loud beats and fall back in the quiet. Bare plaster walls, a single warm lamp, an uneasy late-night mood.";
  return {
    indoorFromFrame: 0,
    design: {
      camera: "held at eye height inside the room, looking across it",
      roomVisible: true,
      roomSign: "negative: loud = walls closer, the box shrinks",
      avatar: "mannequin, dance",
    },
  };
}

/**
 * A hollow stepped pyramid seen from inside. The World Builder's room box is a
 * rectangle, so the visible enclosure is the terraced walls themselves (boxes
 * are double-sided slabs, so they read from inside); the invisible room box is
 * the acoustic proxy and shrinks on the same bars.
 */
export function pyramidInside(
  recipe: Recipe,
  hollow: ReturnType<typeof parts>,
  pan: Recipe["cameraMotion"],
): RoomDesign {
  const motion = recipe.motion!;
  motion.instances!.size = 1;
  const room = {
    // A box of roughly the pyramid's interior volume (about 650 m3).
    dimensions: [10, 8, 10] as SceneVector,
    listener: [0, 1.3, 1.6] as SceneVector,
  };
  heldStates(recipe, "Pyramid interior", hollow, room);
  motion.room = interiorRoom("pyramid-proxy", room.dimensions, room.listener);
  motion.pivot = [0, 0, 0];
  motion.intensity = 1;
  motion.mappings = [
    mapping("walls", "low", "spread", CLOSE_ON_LOUD),
    mapping("width", "low", "roomWidth", -4),
    mapping("depth", "low", "roomDepth", -4),
    mapping("height", "low", "roomHeight", -3),
  ];
  recipe.avatar = true;
  recipe.avatarAsset = "mannequin";
  recipe.avatarMotion = "idle";
  // Ahead of the lens and inside the base even when the walls are closest.
  recipe.avatarPose = { x: 0.6, y: 0, z: -3.2, yaw: 0 };
  recipe.cameraMotion = pan;
  recipe.depthFar = 60;
  recipe.prompt =
    "Inside a vast stepped stone pyramid, looking up from the floor towards the open apex, a lone figure standing for scale. The terraced walls close in on the loud beats and open in the quiet. Warm sandstone, a shaft of daylight from the oculus, dust in the air.";
  return {
    indoorFromFrame: 0,
    design: {
      camera: "fixed near the floor, a slow 45 degree pan looking up",
      enclosure: "hollow stepped pyramid of 128 wall pieces; room box hidden",
      spreadSign: "negative: loud = walls closer",
      roomSign: "negative: the acoustic proxy shrinks in all three axes",
      avatar: "mannequin, idle",
    },
  };
}
