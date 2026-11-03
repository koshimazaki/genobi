import { parameterSchema, type Recipe } from "./recipe";
import { ROUTE_RANGES } from "./mod-routes";
import {
  CAMERA_POSITION_LIMIT,
  INSTANCE_SPACING_RANGE,
  PRIMITIVE_SCALE_RANGE,
  WORLD_POSITION_LIMIT,
} from "./scene-bounds";
import { ROOM_DIMENSION_RANGE, ROOM_WALL_THICKNESS_RANGE } from "./scene-room";
import {
  SCENE_CONTROL_RANGES,
  SCENE_MAPPING_RANGES,
  type SceneRoomState,
  type SceneTransform,
  type SceneVector,
} from "./scene-state";

export type SceneMetricVisitor = (
  value: number,
  min: number,
  max: number,
) => number;

/** One list of authored metric fields serves both resizing and safe slider limits. */
export function visitSceneMetrics(recipe: Recipe, visit: SceneMetricVisitor) {
  const vector = (point: SceneVector, min: number, max: number) =>
    point.map((value) => visit(value, min, max)) as SceneVector;
  const position = (point: { x: number; y: number; z: number }) => {
    for (const axis of ["x", "y", "z"] as const)
      point[axis] = visit(
        point[axis],
        -WORLD_POSITION_LIMIT,
        WORLD_POSITION_LIMIT,
      );
  };
  const transform = (part: SceneTransform) => {
    position(part);
    part.scale = visit(part.scale, ...PRIMITIVE_SCALE_RANGE);
  };
  const roomState = (room: SceneRoomState) => {
    room.dimensions = vector(room.dimensions, ...ROOM_DIMENSION_RANGE);
    for (const field of ["source", "listener"] as const)
      if (room[field])
        room[field] = vector(
          room[field],
          -WORLD_POSITION_LIMIT,
          WORLD_POSITION_LIMIT,
        );
  };
  for (const part of recipe.objects) {
    transform(part);
    for (const axis of ["orbitX", "orbitZ"] as const)
      if (part[axis] !== undefined)
        part[axis] = visit(
          part[axis],
          -WORLD_POSITION_LIMIT,
          WORLD_POSITION_LIMIT,
        );
  }
  for (const part of Object.values(recipe.layout)) transform(part);
  position(recipe.avatarPose);
  for (const key of recipe.avatarPath ?? []) position(key.pose);
  for (const key of ["radius", "targetX", "targetY", "targetZ"] as const) {
    const { min, max } = parameterSchema[key];
    recipe[key] = visit(recipe[key], min, max);
  }
  for (const key of recipe.cameraMotion?.keys ?? []) {
    key.position = vector(
      key.position,
      -CAMERA_POSITION_LIMIT,
      CAMERA_POSITION_LIMIT,
    );
    key.target = vector(
      key.target,
      -CAMERA_POSITION_LIMIT,
      CAMERA_POSITION_LIMIT,
    );
  }
  // Character jump height and camera audio pushes retain their human-scale metres.
  for (const route of recipe.audioRoutes)
    if (route.property === "height" && route.target !== "avatar")
      route.amount = visit(
        route.amount,
        ROUTE_RANGES.amount.min,
        ROUTE_RANGES.amount.max,
      );
  const motion = recipe.motion;
  if (!motion) return;
  motion.pivot = vector(
    motion.pivot,
    -WORLD_POSITION_LIMIT,
    WORLD_POSITION_LIMIT,
  );
  if (motion.instances) {
    motion.instances.spacing = visit(
      motion.instances.spacing,
      ...INSTANCE_SPACING_RANGE,
    );
    motion.instances.size = visit(
      motion.instances.size,
      ...PRIMITIVE_SCALE_RANGE,
    );
  }
  if (motion.room) {
    roomState(motion.room);
    motion.room.center = vector(
      motion.room.center,
      -WORLD_POSITION_LIMIT,
      WORLD_POSITION_LIMIT,
    );
    motion.room.wallThickness = visit(
      motion.room.wallThickness,
      ...ROOM_WALL_THICKNESS_RANGE,
    );
  }
  for (const key of motion.stateKeys) {
    for (const part of Object.values(key.objects)) transform(part);
    if (key.controls?.lift !== undefined)
      key.controls.lift = visit(
        key.controls.lift,
        ...SCENE_CONTROL_RANGES.lift,
      );
    if (key.room) roomState(key.room);
  }
  for (const mapping of motion.mappings)
    if (mapping.property === "lift" || mapping.property.startsWith("room")) {
      const [lo, hi] = SCENE_MAPPING_RANGES[mapping.property];
      mapping.amount = visit(mapping.amount, lo, hi);
    }
}
