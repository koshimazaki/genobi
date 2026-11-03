/**
 * The two wall studies that rebuild the last shots of the 30 October cut: a
 * big hall seen from high over its open end, and a small recording booth seen
 * from above. Each is framed so its frame 0 overlays the owner's still, and on
 * the bass the long side walls clap in towards the centre line and spring back.
 *
 * Axes: x across the room, z along it (the far wall at -z, the camera at +z),
 * y up. Sizes are metres (instance size 1) through `sized`.
 */
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneTransform,
  SceneVector,
} from "../../src/world-builder/scene-state";
import { heldCamera, mapping, sized } from "./recipe-parts";
import { bandBlend, interiorRoom, type RoomDesign } from "./recipes-rooms";

/** "Closing like clapping": the walls close to a quarter of the open width. */
export const WALLS_CLOSED = 0.25;
/**
 * The booth closes to 0.35, not 0.25: its walls then stop 0.53 m from the
 * singer's centre line, clear of the figure's shoulders and arms (tested).
 */
export const BOOTH_CLOSED = 0.35;
/**
 * Morph progress per unit of `low`, as in the other wall studies: captured at
 * motion gain 1, the walls shut from low 0.83 (the auto-gained p95 is 0.8), a
 * full clap on the loud bars. At 0.6 they never got past 0.6 of the way.
 */
export const WALLS_BLEND = 1.2;

/**
 * The closed layout is the open one squeezed in x about the centre line,
 * widths included, so nothing changes height or depth and the centre stays
 * clear for the figure.
 */
export function squeezeX(open: SceneTransform[], fraction = WALLS_CLOSED) {
  return open.map((part) => ({
    ...part,
    x: part.x * fraction,
    scaleX: Math.max(0.1, (part.scaleX ?? 1) * fraction),
  }));
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function builder() {
  const out: SceneTransform[] = [];
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => {
    out.push({
      x: r3(x),
      y: r3(y),
      z: r3(z),
      ...sized(w, h, d),
      color,
    });
  };
  return { out, box };
}

/** The hall: width x, length z, height y, in metres. */
export const HALL = { width: 13, length: 16, height: 5.5, wall: 0.4 } as const;
/** Held high over the open near end, looking down the floor to the far wall. */
export const HALL_CAMERA = {
  position: [0, 6, 14.6] as SceneVector,
  target: [0, 0, -4.8] as SceneVector,
  fov: 27,
};

const PLASTER = "#d8cdb4",
  GLASS = "#eef2ee",
  WOOD = "#8a6a4a";

/**
 * A wall of tall windows: piers between the openings, a band below the sills
 * and one above the heads, and a pale pane set back in each opening. `place`
 * turns a position u along the wall, a height y and a run w x h into a box.
 */
function windowWall(
  windows: number,
  along: number,
  height: number,
  place: (
    u: number,
    y: number,
    w: number,
    h: number,
    color: string,
    inset?: number,
  ) => void,
) {
  const sill = 1.3,
    head = height - 1.2,
    opening = Math.min(1.6, along / (windows * 2.2));
  const pier = (along - windows * opening) / (windows + 1);
  for (let i = 0; i <= windows; i++) {
    const u = -along / 2 + pier / 2 + i * (pier + opening);
    place(u, height / 2, pier, height, PLASTER);
  }
  for (let i = 0; i < windows; i++) {
    const u = -along / 2 + pier + opening / 2 + i * (pier + opening);
    place(u, sill / 2, opening, sill, PLASTER);
    place(u, (head + height) / 2, opening, height - head, PLASTER);
    place(u, (sill + head) / 2, opening, head - sill, GLASS, 0.15);
  }
}

/** The bare hall: three tall windows on each wall, a DJ table at the far end. */
export function hall(): SceneTransform[] {
  const { out, box } = builder();
  const { width: W, length: L, height: H, wall: t } = HALL;
  box(0, 0.025, 0, W, 0.05, L, WOOD);
  // The far wall, across x at -L/2.
  windowWall(3, W, H, (u, y, w, h, color, inset = 0) =>
    box(u, y, -L / 2 - t / 2 - inset, w, h, t, color),
  );
  // The two long side walls, along z at x = +-W/2; the panes sit outside.
  for (const s of [-1, 1])
    windowWall(3, L, H, (u, y, w, h, color, inset = 0) =>
      box(s * (W / 2 + t / 2 + inset), y, u, t, h, w, color),
    );
  // The DJ table and its decks, just off the far wall.
  box(0, 0.4, -L / 2 + 1.2, 1.8, 0.8, 0.8, "#5b4632");
  box(0, 0.86, -L / 2 + 1.2, 1.2, 0.12, 0.5, "#2b2b2e");
  return out;
}

/**
 * The booth: the acoustics study's Small room (2.4 x 3.2 x 2.5 m) turned so its
 * long side runs across the frame, as in the still; the short side walls clap.
 */
export const BOOTH = { width: 3.2, length: 2.4, height: 2.5, wall: 0.12 };
/** Held high over the near wall, looking steeply down into the booth. */
export const BOOTH_CAMERA = {
  position: [0, 6.4, 1.5] as SceneVector,
  target: [0, 0, -0.7] as SceneVector,
  fov: 38,
};

const PANEL = "#9a5f2e",
  FLOOR = "#b37a3d",
  DRUM = "#7b2f20",
  BRASS = "#c9a24a";

/** Wood-panelled walls on all four sides, a drum kit left, a desk right. */
export function booth(): SceneTransform[] {
  const { out, box } = builder();
  const { width: W, length: L, height: H, wall: t } = BOOTH;
  box(0, 0.02, 0, W, 0.04, L, FLOOR);
  for (const s of [-1, 1]) {
    box(s * (W / 2 + t / 2), H / 2, 0, t, H, L + 2 * t, PANEL);
    box(0, H / 2, s * (L / 2 + t / 2), W, H, t, PANEL);
  }
  // Drum kit, left: bass drum, two toms, a snare and two cymbals.
  // Everything stays behind the singer (z under 0.3), so nothing squeezed
  // in from the sides can reach the figure.
  box(-0.85, 0.28, -0.1, 0.55, 0.56, 0.45, DRUM);
  box(-0.95, 0.65, -0.6, 0.32, 0.24, 0.32, DRUM);
  box(-0.55, 0.65, -0.5, 0.3, 0.22, 0.3, DRUM);
  box(-1.15, 0.6, 0.05, 0.36, 0.14, 0.36, "#8a8a86");
  box(-1.25, 1.05, 0.0, 0.5, 0.03, 0.5, BRASS);
  box(-0.55, 1.2, -0.85, 0.45, 0.03, 0.45, BRASS);
  // Mixing desk along the right wall, its long side along z.
  box(1.05, 0.42, -0.4, 0.7, 0.84, 1.3, "#3a3a3d");
  box(1.05, 0.88, -0.4, 0.62, 0.06, 1.2, "#6d6f73");
  // The microphone stand in front of the singer, and its pop shield.
  box(0, 0.8, -0.1, 0.05, 1.6, 0.05, "#26262a");
  box(0, 1.5, 0.05, 0.25, 0.25, 0.03, "#1e1e22");
  return out;
}

const MANNEQUIN = { avatar: true, avatarAsset: "mannequin" } as const;

/**
 * The open layout and its x-squeezed twin, blended on the low band. The
 * closed state's reverb box is narrower by the same fraction (never under the
 * engine's 1 m), and its hidden proxy box carries the room mappings.
 */
function clap(
  recipe: Recipe,
  label: string,
  open: SceneTransform[],
  room: { width: number; length: number; height: number },
  listener: SceneVector,
  fraction = WALLS_CLOSED,
) {
  const motion = recipe.motion!;
  motion.instances!.count = open.length;
  motion.instances!.size = 1;
  const { width: W, length: L, height: H } = room;
  bandBlend(
    recipe,
    label,
    open,
    squeezeX(open, fraction),
    { dimensions: [W, H, L], listener },
    { dimensions: [Math.max(1, W * fraction), H, L], listener },
  );
  motion.morphControl!.progress.amount = WALLS_BLEND;
  motion.room = interiorRoom(
    `${label.toLowerCase()}-proxy`,
    [W, H, L],
    listener,
  );
  return { motion, W, L, H };
}

/** The big hall from the 30 October cut: the long walls clap in on the bass. */
export function partyWalls(recipe: Recipe): RoomDesign {
  const open = hall();
  const { motion, W, L, H } = clap(recipe, "Hall", open, HALL, [0, 1.7, 2]);
  motion.mappings = [
    mapping("width", "low", "roomWidth", -4),
    mapping("depth", "low", "roomDepth", -2),
  ];
  Object.assign(recipe, MANNEQUIN, {
    avatarMotion: "dance",
    avatarPose: { x: 0, y: 0, z: 0, yaw: 0 },
  });
  recipe.cameraMotion = heldCamera(
    HALL_CAMERA.position,
    HALL_CAMERA.target,
    HALL_CAMERA.fov,
  );
  recipe.depthFar = 60;
  recipe.prompt =
    "A high corner view of a big bare hall with tall windows, a crowd dancing on the wooden floor and a DJ at the far end; on the beat the long walls close in toward the dancers and open again. Warm daylight, still camera.";
  return {
    indoorFromFrame: 0,
    design: {
      camera: "held above the open near end, over the wall tops, no audio push",
      hall: `${W} x ${L} x ${H} m, ${open.length} pieces: window walls on three sides, floor, DJ table`,
      close: `blend: morphControl open -> closed on low, x only, to ${WALLS_CLOSED} of the open width`,
      roomSign:
        "the closed state's reverb box is a quarter as wide; width and depth mappings shrink it on the same bars",
      avatar: "mannequin, dance, centre of the floor",
    },
  };
}

/** The recording booth from the 30 October cut, seen from above. */
export function studioWalls(recipe: Recipe): RoomDesign {
  const open = booth();
  const { motion, W, L, H } = clap(
    recipe,
    "Booth",
    open,
    BOOTH,
    [0, 1.6, 0.6],
    BOOTH_CLOSED,
  );
  // The default source (1 m left, 2 m back) would sit outside the booth.
  motion.room = { ...motion.room!, source: [0, 1.2, -0.8] };
  motion.mappings = [
    mapping("width", "low", "roomWidth", -1.4),
    mapping("depth", "low", "roomDepth", -1),
  ];
  Object.assign(recipe, MANNEQUIN, {
    avatarMotion: "idle",
    avatarPose: { x: 0, y: 0, z: 0.55, yaw: 3.14 },
  });
  recipe.cameraMotion = heldCamera(
    BOOTH_CAMERA.position,
    BOOTH_CAMERA.target,
    BOOTH_CAMERA.fov,
  );
  recipe.depthFar = 20;
  recipe.prompt =
    "Straight down into a small wood-panelled recording booth: a drum kit, a mixing desk, a singer with headphones under one warm lamp; on the beat the booth's walls close in and open again. Still camera.";
  return {
    indoorFromFrame: 0,
    design: {
      camera: "held above the walls, looking almost straight down",
      booth: `${W} x ${L} x ${H} m, ${open.length} pieces: four panelled walls, floor, drum kit, desk, microphone`,
      close: `blend: morphControl open -> closed on low, x only, to ${BOOTH_CLOSED} of the open width`,
      roomSign:
        "the closed state's reverb box narrows to 1 m (the engine's minimum); width and depth mappings on the same bars",
      avatar: "mannequin, idle, bottom centre facing the far wall",
    },
  };
}
