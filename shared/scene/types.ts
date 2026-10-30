/**
 * Scenes as data (#18). A scene names its subject point (where plates aim),
 * the scale that maps Holodeck's move offsets onto it, and its contents: a
 * list of primitives. The built-in scenes, an agent-built scene and a scene
 * loaded from a file all have this shape; nothing in it runs as code.
 */
import type { SceneCharacter } from "./characters";
export type Vec3 = [number, number, number];

export const SCENE_VERSION = 1;

/** Theme tokens a primitive can take; resolved from CSS at build time. */
export const SCENE_COLOURS = [
  "subject",
  "accent",
  "dark",
  "acoustic",
  "glass",
] as const;
export type SceneColour = (typeof SCENE_COLOURS)[number];

export const SCENE_SHAPES = [
  "box",
  "sphere",
  "cylinder",
  "cone",
  "torusKnot",
  "icosahedron",
] as const;
export type SceneShape = (typeof SCENE_SHAPES)[number];

/** Surface materials: how a primitive looks and how much sound it absorbs. */
export const SCENE_MATERIALS = [
  "tile",
  "concrete",
  "plaster",
  "wood",
  "carpet",
  "curtain",
  "glass",
  "metal",
] as const;
export type SceneMaterial = (typeof SCENE_MATERIALS)[number];

/**
 * Which boxes bound the room. Acoustics reads walls, floor and ceiling; a
 * primitive with no role is a prop.
 */
export const SCENE_ROLES = ["wall", "floor", "ceiling", "prop"] as const;
export type SceneRole = (typeof SCENE_ROLES)[number];

export interface ScenePrimitive {
  /** Optional, unique in the scene; commands name a primitive by it. */
  id?: string;
  shape: SceneShape;
  position: Vec3;
  /** Width, height, depth in metres (radius from x for round shapes). */
  size: Vec3;
  rotationY?: number;
  colour: SceneColour;
  material?: SceneMaterial;
  role?: SceneRole;
  /** Hero parts form one group that object gestures move. */
  hero?: boolean;
  glow?: boolean;
}

export const ACOUSTIC_ROOMS = [
  "medium_room",
  "small_room",
  "cathedral",
] as const;

export type SceneContent =
  | { kind: "primitives"; ground: number }
  | { kind: "acoustic-room"; room: (typeof ACOUSTIC_ROOMS)[number] };

export interface SceneSpec {
  version: typeof SCENE_VERSION;
  /** Counts accepted edits; a command must name the current one. */
  revision: number;
  id: string;
  label: string;
  summary: string;
  /** The point a plate orbits and looks at. */
  subject: Vec3;
  /** Where acoustics places the listener; 3 m in front of the subject if absent. */
  listener?: Vec3;
  /** Multiplies Holodeck's offsets, which were built around a 1.8 m figure. */
  scale: number;
  fov: number;
  content: SceneContent;
  objects: readonly ScenePrimitive[];
  /** Fixed, bundled mannequins used for blocking and deterministic capture. */
  characters?: readonly SceneCharacter[];
}

/** Bounds every reader of a scene shares (the parser, commands and the UI). */
export const SCENE_LIMITS = {
  primitives: 200,
  minSize: 0.01,
  maxSize: 200,
  maxPosition: 500,
  fov: [10, 120],
  scale: [0.1, 20],
  ground: [1, 500],
  label: 80,
  summary: 300,
  /** The compact JSON document, in UTF-8 bytes. */
  bytes: 64_000,
} as const;

/** Scene ids also travel in the playblast receipt, whose limit is 40. */
export const SCENE_ID = /^[a-z][a-z0-9-]{0,39}$/;
