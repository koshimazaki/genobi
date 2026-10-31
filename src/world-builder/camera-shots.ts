import { CAMERA_MOVE_BY_KEY, type CameraMoveKey } from "./camera-moves";
import { parameterSchema, type Recipe } from "./recipe";

const boundedTarget = (
  axis: "targetX" | "targetY" | "targetZ",
  value: number,
) =>
  Math.max(
    parameterSchema[axis].min,
    Math.min(parameterSchema[axis].max, value),
  );
/**
 * Same shot vocabulary as Holodeck; trajectories replay on the fixed frame
 * grid. `seconds`, when given, is the move's duration (the take's frames
 * follow it); otherwise the recipe keeps its length. `motion`, when given,
 * sets the character's moves for the same take.
 */
export function shotPatch(
  key: CameraMoveKey,
  r: Recipe,
  subject: [number, number, number] = [r.targetX, r.targetY, r.targetZ],
  seconds?: number,
  motion?: Recipe["avatarMotion"],
): Partial<Recipe> {
  const move = CAMERA_MOVE_BY_KEY[key],
    offset =
      move.kind === "static"
        ? move.position
        : move.kind === "follow"
          ? move.offset
          : [0, move.height, move.radius];
  const radius = Math.hypot(...offset),
    target = move.kind === "static" ? [0, 0, 0] : move.lookOffset;
  const patch: Partial<Recipe> = {
    ...(r.cameraMotion
      ? { cameraMotion: { ...r.cameraMotion, enabled: false } }
      : {}),
    cameraShot: key,
    azimuth: (Math.atan2(offset[0], offset[2]) * 180) / Math.PI,
    elevation: (Math.asin(offset[1] / radius) * 180) / Math.PI,
    radius: Math.max(2, radius),
    targetX: boundedTarget("targetX", subject[0] + target[0]),
    targetY: boundedTarget("targetY", subject[1] + target[1]),
    targetZ: boundedTarget("targetZ", subject[2] + target[2]),
    orbit: move.kind === "orbit" ? move.degrees : 0,
    dolly: 0,
    elevationEnd: null,
  };
  if (key === "pushIn") {
    patch.radius = 10;
    patch.dolly = radius / 10 - 1;
  }
  if (key === "pullOut") {
    patch.radius = 10;
    patch.dolly = radius / 10 - 1;
  }
  if (key === "crane") {
    patch.elevation = 5;
    patch.elevationEnd = patch.elevation! + 30;
  }
  if (key === "top") patch.elevation = 89;
  if (seconds !== undefined) patch.seconds = seconds;
  if (motion !== undefined) patch.avatarMotion = motion;
  return patch;
}
