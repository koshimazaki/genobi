/**
 * The built-in scenes. The scene types live in `shared/scene/types.ts`, so an
 * agent-built or loaded scene (`parseScene`) has this same shape; nothing
 * here runs code.
 */
import type { ScenePrimitive, SceneSpec, Vec3 } from "../../shared/scene/types";
import { EXAMPLE_IDS, exampleScene } from "../../shared/scene/examples";

export type {
  SceneColour,
  SceneContent,
  ScenePrimitive,
  SceneSpec,
  Vec3,
} from "../../shared/scene/types";

const pillar = (x: number, z: number, h: number): ScenePrimitive => ({
  shape: "box",
  position: [x, h / 2, z],
  size: [0.9, h, 0.9],
  colour: "dark",
});

const HERO: readonly ScenePrimitive[] = [
  {
    shape: "cylinder",
    position: [0, 0.18, 0],
    size: [1, 0.36, 1],
    colour: "dark",
  },
  {
    shape: "sphere",
    position: [0, 0.96, 0],
    size: [0.6, 0.6, 0.6],
    colour: "subject",
    hero: true,
  },
];

export const SCENES: readonly SceneSpec[] = [
  {
    version: 1,
    revision: 0,
    id: "set",
    label: "Set",
    summary: "Ground, a hero object on a plinth, pillars for parallax, lights.",
    subject: [0, 1.2, 0],
    scale: 1,
    fov: 38,
    content: { kind: "primitives", ground: 120 },
    objects: [
      ...HERO,
      pillar(-8, -9, 4.5),
      pillar(9, -7, 3),
      pillar(-12, 4, 2.4),
      pillar(11, 8, 5.5),
      pillar(2, -14, 6.5),
      {
        shape: "sphere",
        position: [-5, 0.7, 6],
        size: [0.7, 0.7, 0.7],
        colour: "subject",
      },
      {
        shape: "icosahedron",
        position: [6, 1, 3],
        size: [0.8, 0.8, 0.8],
        colour: "subject",
      },
      {
        shape: "cone",
        position: [-3, 0.9, -5],
        size: [0.6, 1.8, 0.6],
        colour: "subject",
      },
    ],
  },
  {
    version: 1,
    revision: 0,
    id: "acoustic-room",
    label: "Acoustic room",
    summary:
      "The AKUSPACE medium room from Acoustic Space, with the hero inside.",
    subject: [0, 0.6, 0],
    scale: 0.4,
    fov: 40,
    content: { kind: "acoustic-room", room: "medium_room" },
    objects: [
      ...HERO.map((p) => ({
        ...p,
        position: p.position.map((v) => v * 0.5) as Vec3,
        size: p.size.map((v) => v * 0.5) as Vec3,
      })),
      {
        shape: "sphere",
        position: [-1.36, 0.34, -1.49],
        size: [0.2, 0.2, 0.2],
        colour: "acoustic",
        glow: true,
      },
    ],
  },
];

export const EXAMPLE_SCENES: readonly SceneSpec[] = EXAMPLE_IDS.map((id) =>
  exampleScene(id),
);
export const SCENE_BY_ID: Record<string, SceneSpec> = Object.fromEntries(
  [...SCENES, ...EXAMPLE_SCENES].map((s) => [s.id, s]),
);
