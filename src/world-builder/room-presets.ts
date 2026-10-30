import rooms from "../../custom_nodes/director_world_builder/acoustics.json";
import type { Prop, Recipe } from "./recipe";
import type { ModRoute } from "./mod-routes";

export type RoomId = keyof typeof rooms.rooms;
/** Sizes (metres) and surface materials shared with the Comfy Acoustics node. */
export const roomSets = rooms.rooms;

/** Editable open-front, open-top sets. Each wall's prompt names its material,
 * which the Acoustics node reads; this does not configure AKUSPACE itself.
 */
function room(roomId: RoomId, extra: Partial<Recipe> = {}): Partial<Recipe> {
  const { size_m, color, materials } = roomSets[roomId];
  const [width, length, height] = size_m;
  // Wall axes are capped at 8, so large rooms raise the uniform scale instead.
  const scale = Math.max(1, Math.ceil(Math.max(...size_m) / 16));
  const wall = (
    id: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    prompt: string,
    rotation = 0,
    rotationX = 0,
  ): Prop => ({
    id,
    shape: "plane",
    x,
    y,
    z,
    scale,
    scaleX: w / 2 / scale,
    scaleY: h / 2 / scale,
    rotation,
    rotationX,
    spin: 0,
    color,
    prompt,
  });
  const walls = materials.walls;
  return {
    scene: "stage",
    avatar: true,
    avatarPose: { x: 0, y: 0, z: 0, yaw: 0 },
    targetY: 1,
    radius: 2.5,
    azimuth: 0,
    elevation: 6,
    orbit: 0,
    background: "#171e29",
    objects: [
      wall(
        "room-floor",
        0,
        0,
        0,
        width,
        length,
        materials.floor,
        0,
        -Math.PI / 2,
      ),
      wall("room-north", 0, height / 2, -length / 2, width, height, walls),
      wall(
        "room-east",
        width / 2,
        height / 2,
        0,
        length,
        height,
        walls,
        Math.PI / 2,
      ),
      wall(
        "room-west",
        -width / 2,
        height / 2,
        0,
        length,
        height,
        walls,
        Math.PI / 2,
      ),
      ...REACTIVE_PROPS,
    ],
    audioRoutes: REACTIVE_ROUTES,
    ...extra,
  };
}

/**
 * Two test objects for reactive work, either side of the character and
 * slowly circling it (`orbit`, rad/s, about the scene centre where the
 * character stands): a sphere that rises and grows with the low band, and a
 * cube that shrinks as the mid band rises (an inverted route) while it spins
 * on its own axis with the mids. Small enough to sit inside the Small room.
 */
export const REACTIVE_PROPS: Prop[] = [
  {
    id: "pulse-sphere",
    shape: "sphere",
    x: -0.9,
    y: 0.8,
    z: 0,
    scale: 0.35,
    spin: 0,
    orbit: 0.3,
    color: "#e9b86c",
    prompt: "",
  },
  {
    id: "spin-cube",
    shape: "box",
    x: 0.9,
    y: 0.8,
    z: 0,
    scale: 0.4,
    spin: 0,
    orbit: 0.3,
    color: "#7fb3d5",
    prompt: "",
  },
];
const route = (
  id: string,
  source: "low" | "mid",
  target: string,
  property: ModRoute["property"],
  amount: number,
  invert = false,
): ModRoute => ({
  id,
  enabled: true,
  source,
  target,
  property,
  amount,
  threshold: 0,
  invert,
  lerp: 0.35,
});
export const REACTIVE_ROUTES: ModRoute[] = [
  route("sphere-rise", "low", "prop:pulse-sphere", "height", 0.8),
  route("sphere-grow", "low", "prop:pulse-sphere", "scale", 0.9),
  route("cube-shrink", "mid", "prop:spin-cube", "scale", 0.8, true),
  route("cube-spin", "mid", "prop:spin-cube", "spin", 4),
];

export const roomPresets = {
  // The owner's creature when it is attached under Scene; the Load preset
  // menu falls back to the mannequin without it (`preset-menu.ts`).
  "Small room": room("small_room", { avatarAsset: "creature" }),
  "Acoustic room": room("medium_room"),
  Club: room("empty_club"),
  Cathedral: room("cathedral"),
};
