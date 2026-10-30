/**
 * Writes the mannequin move library: one World Builder recipe per move under
 * custom_nodes/director_world_builder/examples/moves/, each a 5 to 10 s take
 * in a room with a named camera shot. The JSON files are the library; this
 * script only records how they were made. Add a move by adding a
 * recipe file, or a row here and re-running it:
 *
 *   npx tsx scripts/make-move-takes.ts
 */
import { writeFileSync } from "node:fs";
import { shotPatch } from "../src/world-builder/camera-shots";
import type { CameraMoveKey } from "../src/world-builder/camera-moves";
import type { MotionStep } from "../src/world-builder/motion";
import type { ModRoute } from "../src/world-builder/mod-routes";
import {
  presetRecipe,
  validateRecipe,
  type Prop,
  type Recipe,
} from "../src/world-builder/recipe";

const DIR = "custom_nodes/director_world_builder/examples/moves";
interface Take {
  id: string;
  room: "Small room" | "Acoustic room" | "Club" | "Cathedral";
  shot: CameraMoveKey;
  /** Character facing in degrees; the shot turns with it. */
  yaw: number;
  fov: number;
  frames: number;
  moves: MotionStep[];
  prompt: string;
  /** Degrees added to the shot's starting azimuth, to centre an orbit. */
  azimuth?: number;
  props?: Prop[];
  /** Replaces the room's default audio routes. */
  routes?: ModRoute[];
}
const seat: Prop = {
  id: "seat",
  shape: "box",
  x: 0,
  y: 0.24,
  z: -0.3,
  scale: 0.23,
  scaleX: 2.6,
  scaleY: 2.1,
  scaleZ: 1.6,
  spin: 0,
  color: "#8a7f72",
  prompt: "a plain wooden bench",
};
const ball = (id: string, x: number, color: string): Prop => ({
  id,
  shape: "sphere",
  x,
  y: 0.95,
  z: 0,
  scale: 0.35,
  spin: 0,
  color,
  prompt: "a glossy ball floating at hip height",
});
const route = (
  id: string,
  source: ModRoute["source"],
  target: string,
  property: ModRoute["property"],
  amount: number,
  lerp: number,
): ModRoute => ({
  id,
  enabled: true,
  source,
  target,
  property,
  amount,
  threshold: 0.02,
  invert: false,
  lerp,
});
/** Idle, struck, then down: Death01 falls in place and holds on the floor. */
const fallMoves: MotionStep[] = [
  { clip: "idle", seconds: 1 },
  { clip: "hit", seconds: 0.5 },
  { clip: "fall", seconds: 4.5 },
];
const fallIn = (id: string, room: Take["room"], where: string): Take => ({
  id,
  room,
  shot: "highWide",
  yaw: 0,
  fov: 50,
  frames: 145,
  azimuth: -30,
  moves: fallMoves,
  prompt: `Seen from above, a figure is struck and collapses to the floor of ${where}.`,
});
const takes: Take[] = [
  {
    id: "jog",
    room: "Acoustic room",
    shot: "sideAction",
    yaw: -90,
    fov: 22,
    frames: 121,
    moves: [
      { clip: "idle", seconds: 1 },
      { clip: "jog", seconds: 4 },
    ],
    prompt: "A figure starts to jog on the spot in a plaster room, side on.",
  },
  {
    id: "sprint",
    room: "Cathedral",
    shot: "lowTrack",
    yaw: 180,
    fov: 40,
    frames: 121,
    moves: [
      { clip: "jog", seconds: 1.5 },
      { clip: "sprint", seconds: 3.5 },
    ],
    prompt: "Low behind a runner who breaks into a sprint toward the altar.",
  },
  {
    id: "jump",
    room: "Small room",
    shot: "face",
    yaw: 0,
    fov: 26,
    frames: 145,
    moves: [
      { clip: "idle", seconds: 1 },
      { clip: "jump", seconds: 1.25 },
      { clip: "jump-air", seconds: 0.5 },
      { clip: "land", seconds: 1.25 },
      { clip: "idle", seconds: 2 },
    ],
    prompt: "A figure jumps straight up in a small room and lands, facing us.",
  },
  {
    id: "roll",
    room: "Club",
    shot: "sideAction",
    yaw: -90,
    fov: 22,
    frames: 121,
    moves: [
      { clip: "jog", seconds: 1.5 },
      { clip: "roll", seconds: 1.5 },
      { clip: "idle", seconds: 2 },
    ],
    prompt: "Side on, a figure jogs, dives into a forward roll and stands.",
  },
  {
    id: "fall",
    room: "Cathedral",
    shot: "orbit60",
    yaw: 0,
    fov: 22,
    frames: 145,
    azimuth: -30,
    moves: [
      { clip: "idle", seconds: 1.5 },
      { clip: "hit", seconds: 0.5 },
      { clip: "fall", seconds: 4 },
    ],
    prompt: "A figure is struck and falls to the cathedral floor; slow orbit.",
  },
  {
    id: "sit",
    room: "Acoustic room",
    shot: "face",
    yaw: 0,
    fov: 24,
    frames: 169,
    props: [seat],
    moves: [
      { clip: "idle", seconds: 1 },
      { clip: "sit-down", seconds: 1.25 },
      { clip: "sit", seconds: 1.5 },
      { clip: "sit-talk", seconds: 1.5 },
      { clip: "stand-up", seconds: 1 },
      { clip: "idle", seconds: 0.75 },
    ],
    prompt: "A figure sits on a bench, talks, then stands up again.",
  },
  {
    id: "crouch",
    room: "Small room",
    shot: "pushIn",
    yaw: 0,
    fov: 30,
    frames: 121,
    moves: [
      { clip: "idle", seconds: 1 },
      { clip: "crouch", seconds: 2 },
      { clip: "crouch-walk", seconds: 2 },
    ],
    prompt: "The camera pushes in as a figure drops into a crouch and creeps.",
  },
  {
    id: "sword",
    room: "Club",
    shot: "shoulder",
    yaw: 180,
    fov: 38,
    frames: 145,
    moves: [
      { clip: "idle", seconds: 1 },
      { clip: "sword", seconds: 1.5 },
      { clip: "idle", seconds: 0.75 },
      { clip: "sword", seconds: 1.5 },
      { clip: "idle", seconds: 1.25 },
    ],
    prompt:
      "Over the shoulder, a figure swings a sword twice in an empty club.",
  },
  fallIn("fall-cathedral", "Cathedral", "a vast cathedral"),
  fallIn("fall-small-room", "Small room", "a small room"),
  fallIn("fall-medium-room", "Acoustic room", "a plaster room"),
  {
    id: "dance-balls",
    room: "Club",
    shot: "face",
    yaw: 0,
    fov: 34,
    frames: 121,
    moves: [{ clip: "dance", seconds: 5 }],
    props: [
      ball("ball-left", -1.2, "#e0577a"),
      ball("ball-right", 1.2, "#4fb8d8"),
    ],
    routes: [
      route("route-1", "low", "prop:ball-left", "scale", 1.8, 0.6),
      route("route-2", "high", "prop:ball-right", "height", 1, 0.6),
      route("route-3", "mid", "prop:ball-left", "glow", 1.5, 0.6),
      route("route-4", "mid", "prop:ball-right", "glow", 1.5, 0.6),
    ],
    prompt:
      "A figure dances in a club between two balls that pulse with the beat.",
  },
];

const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
for (const t of takes) {
  const base = presetRecipe(t.room);
  const subject: [number, number, number] = [0, 0, 0];
  const shot = shotPatch(t.shot, base, subject, undefined, t.moves);
  const recipe: Recipe = validateRecipe({
    ...base,
    ...shot,
    azimuth: wrap(shot.azimuth! + t.yaw + (t.azimuth ?? 0)),
    width: 1024,
    height: 576,
    frames: t.frames,
    fov: t.fov,
    avatar: true,
    avatarAsset: "mannequin",
    avatarPose: { x: 0, y: 0, z: 0, yaw: wrap(t.yaw) * (Math.PI / 180) },
    objects: [...base.objects, ...(t.props ?? [])],
    ...(t.routes ? { audioRoutes: t.routes } : {}),
    prompt: `Move library · ${t.id}: ${t.prompt}`,
  });
  writeFileSync(`${DIR}/${t.id}.json`, JSON.stringify(recipe, null, 2) + "\n");
  console.log(`${t.id}: ${t.frames} f, ${t.shot}, ${t.room}`);
}
