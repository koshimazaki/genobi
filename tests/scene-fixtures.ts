// Reference rooms for the scene acoustics tests: materials are tuned here,
// never in the formula, to land near AKUSPACE's preset decays.
import { applyCommand, createScene } from "../shared/scene/commands";
import type { RoomOptions } from "../shared/scene/room";
import type { ScenePrimitive, SceneSpec } from "../shared/scene/types";

export function sceneWith(
  room: RoomOptions,
  props: ScenePrimitive[] = [],
  id = "fixture",
): SceneSpec {
  let doc = createScene(id);
  doc = applyCommand(doc, { op: "room", ...room }, doc.revision);
  for (const primitive of props)
    doc = applyCommand(doc, { op: "add-primitive", primitive }, doc.revision);
  return doc;
}

export const prop = (
  id: string,
  material: ScenePrimitive["material"],
  position: ScenePrimitive["position"],
  size: ScenePrimitive["size"],
): ScenePrimitive => ({
  id,
  shape: "box",
  colour: "dark",
  material,
  position,
  size,
});

/** A tiled bathroom, 2.0 × 2.5 × 2.4 m, with a door and a shower curtain. */
export const bathroom = () =>
  sceneWith(
    {
      width: 2,
      length: 2.5,
      height: 2.4,
      wallMaterial: "tile",
      floorMaterial: "tile",
      ceilingMaterial: "plaster",
      door: { wall: "south", offset: 0.4, width: 0.8, height: 2 },
    },
    [prop("shower-curtain", "curtain", [-0.5, 1.2, -0.6], [0.02, 1.6, 0.5])],
    "bathroom",
  );

/** An empty club, 12 × 18 × 5 m: plaster and concrete, a stage curtain. */
export const club = () =>
  sceneWith(
    {
      width: 12,
      length: 18,
      height: 5,
      wallMaterial: "plaster",
      floorMaterial: "concrete",
      ceilingMaterial: "wood",
      door: { wall: "south", offset: 0, width: 2, height: 2.5 },
    },
    [
      prop("backdrop", "curtain", [0, 2.5, -8.9], [11.8, 5, 0.05]),
      prop("wing", "curtain", [-5.9, 2.5, -6], [0.05, 5, 4]),
      prop("bar", "wood", [5, 0.55, 2], [1, 1.1, 8]),
    ],
    "club",
  );

/** A plaster room, 7 × 9 × 3.2 m, wooden floor, one sofa. */
export const mediumRoom = () =>
  sceneWith(
    {
      width: 7,
      length: 9,
      height: 3.2,
      wallMaterial: "plaster",
      floorMaterial: "wood",
      ceilingMaterial: "plaster",
      door: { wall: "south", offset: 2, width: 0.9, height: 2.1 },
    },
    [prop("sofa", "curtain", [0, 0.4, 2], [1.8, 0.8, 0.4])],
    "medium",
  );

/** A stone nave, 20 × 60 × 25 m: carpeted floor, timber roof, great door. */
export const nave = () =>
  sceneWith(
    {
      width: 20,
      length: 60,
      height: 25,
      wallMaterial: "concrete",
      floorMaterial: "carpet",
      ceilingMaterial: "wood",
      door: { wall: "south", offset: 0, width: 6, height: 10 },
    },
    [],
    "nave",
  );

/** Curtain on every wall and carpet underfoot: mean absorption above 0.2. */
export const curtained = () =>
  sceneWith(
    {
      width: 5,
      length: 6,
      height: 3,
      wallMaterial: "curtain",
      floorMaterial: "carpet",
      ceilingMaterial: "plaster",
    },
    [],
    "curtained",
  );
