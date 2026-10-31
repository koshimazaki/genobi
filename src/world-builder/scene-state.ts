import type { Prop } from "./recipe";
import type { ModSource } from "./mod-routes";
export { motionInstances, sceneObjects } from "./scene-instances";

/** Versioned, finite authored state. Instance topology and materials stay fixed. */
export type SceneVector = [number, number, number];
export type SceneTransform = Pick<Prop, "x" | "y" | "z" | "scale"> &
  Pick<
    Prop,
    "rotation" | "rotationX" | "rotationZ" | "scaleX" | "scaleY" | "scaleZ"
  >;
export const SCENE_CONTROL_DEFAULTS = {
  twistX: 0,
  twistY: 0,
  spread: 0,
  lift: 0,
  scale: 1,
};
export type SceneControls = typeof SCENE_CONTROL_DEFAULTS;
export const SCENE_CONTROL_RANGES = {
  twistX: [-Math.PI * 2, Math.PI * 2],
  twistY: [-Math.PI * 2, Math.PI * 2],
  spread: [-0.75, 3],
  lift: [-10, 10],
  scale: [0.1, 3],
} as const;
export const SCENE_MAPPING_RANGES = {
  morph: [-1, 1],
  twistX: [-Math.PI, Math.PI],
  twistY: [-Math.PI, Math.PI],
  spread: [-0.75, 2],
  lift: [-4, 4],
  scale: [-0.75, 2],
  roomWidth: [-4, 4],
  roomHeight: [-4, 4],
  roomDepth: [-4, 4],
} as const;
export type SceneMappingProperty = keyof typeof SCENE_MAPPING_RANGES;
export interface SceneMapping {
  id: string;
  source: ModSource;
  property: SceneMappingProperty;
  amount: number;
  enabled: boolean;
}
export const ROOM_FACES = [
  "floor",
  "ceiling",
  "north",
  "south",
  "east",
  "west",
] as const;
export type RoomFace = (typeof ROOM_FACES)[number];
export interface SceneRoomState {
  /** Width, height, depth in metres. */
  dimensions: SceneVector;
  /** Local coordinates: y is height above the floor; x/z are centered. */
  source?: SceneVector;
  listener?: SceneVector;
}
export interface SceneRoom extends SceneRoomState {
  id: string;
  /** World position of the centre of the floor. */
  center: SceneVector;
  source: SceneVector;
  listener: SceneVector;
  absorption: Record<RoomFace, number>;
  seed: number;
  wallThickness: number;
  visible: boolean;
  /** Omits the south wall and ceiling from the guide, not the acoustic model. */
  cutaway?: boolean;
}
export interface SceneInstances {
  generator: "voxel-lattice";
  version: 1;
  seed: number;
  count: number;
  columns: number;
  spacing: number;
  size: number;
  palette: string[];
}
export interface SceneStateKey {
  id: string;
  label: string;
  frame: number;
  /** Interpolation from this key to the next. */
  easing: "linear" | "easeInOut";
  objects: Record<string, SceneTransform>;
  controls?: Partial<SceneControls>;
  room?: SceneRoomState;
}
export interface SceneMotion {
  version: 1;
  pivot: SceneVector;
  instances?: SceneInstances;
  stateKeys: SceneStateKey[];
  mappings: SceneMapping[];
  intensity: number;
  room?: SceneRoom;
}
export const MAX_SCENE_KEYS = 16;
export const MAX_SCENE_INSTANCES = 128;
export const MAX_EVALUATED_OBJECTS = 24 + MAX_SCENE_INSTANCES + 6;

/** Transform-only copy: editing a key cannot change topology or material. */
export function sceneTransformOf(p: Prop): SceneTransform {
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    scale: p.scale,
    ...(p.rotation !== undefined ? { rotation: p.rotation } : {}),
    ...(p.rotationX !== undefined ? { rotationX: p.rotationX } : {}),
    ...(p.rotationZ !== undefined ? { rotationZ: p.rotationZ } : {}),
    ...(p.scaleX !== undefined ? { scaleX: p.scaleX } : {}),
    ...(p.scaleY !== undefined ? { scaleY: p.scaleY } : {}),
    ...(p.scaleZ !== undefined ? { scaleZ: p.scaleZ } : {}),
  };
}
