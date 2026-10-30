import {
  cameraSections,
  type CameraSelection,
  type PoseSettings,
} from "../../shared/camera";
export type Point3 = [number, number, number];
export type CameraPose = {
  position: Point3;
  target: Point3;
  roll: number;
  subjectRotation: number;
};
const rad = (degrees: number) => (degrees * Math.PI) / 180;
/** Combine distance/framing, angle, then motion. These are illustrative, not model controls. */
export function cameraPose(
  selection: CameraSelection,
  progress: number,
): CameraPose {
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const eased = t * t * (3 - 2 * t);
  // Poses come from every term, whatever model's wording is shown, so an
  // LTX-only move (Dolly out, Jib down) still moves the preview camera.
  const pose: PoseSettings = Object.assign(
    {},
    ...cameraSections.map(
      (section) =>
        section.terms.find((item) => item.id === selection[section.id])?.pose,
    ),
  );
  let distance = pose.distance ?? 2.7;
  let azimuth = rad(pose.azimuth ?? 0);
  const target: Point3 = [0, pose.targetY ?? 0.9, 0];
  const elevation = rad(pose.elevation ?? 8);
  const amount = pose.amount ?? 0;
  if (pose.motion === "orbit" || pose.motion === "arc")
    azimuth += rad(amount) * eased;
  if (pose.motion === "dolly") distance *= 1 + amount * eased;
  const horizontal = Math.cos(elevation) * distance;
  const position: Point3 = [
    Math.sin(azimuth) * horizontal,
    Math.max(0.12, target[1] + Math.sin(elevation) * distance),
    Math.cos(azimuth) * horizontal,
  ];
  if (pose.motion === "crane") position[1] += amount * eased;
  if (pose.motion === "truck") {
    position[0] += Math.cos(azimuth) * amount * (eased - 0.5);
    position[2] -= Math.sin(azimuth) * amount * (eased - 0.5);
  }
  if (pose.motion === "pan") {
    target[0] += Math.cos(azimuth) * amount * (eased - 0.5);
    target[2] -= Math.sin(azimuth) * amount * (eased - 0.5);
  }
  if (pose.motion === "tilt") target[1] += amount * (eased - 0.5);
  if (pose.motion === "handheld") {
    // A small slow sway, so the guide reads as held by hand rather than locked.
    position[0] += Math.sin(t * Math.PI * 4) * amount;
    position[1] += Math.sin(t * Math.PI * 6 + 1) * amount * 0.5;
  }
  return {
    position,
    target,
    roll: rad(pose.roll ?? 0),
    subjectRotation: pose.motion === "subject" ? rad(amount) * eased : 0,
  };
}
export function cameraPath(
  selection: CameraSelection,
  segments = 48,
): Point3[] {
  const count = Number.isFinite(segments)
    ? Math.max(1, Math.min(128, Math.floor(segments)))
    : 48;
  return Array.from(
    { length: count + 1 },
    (_, i) => cameraPose(selection, i / count).position,
  );
}
