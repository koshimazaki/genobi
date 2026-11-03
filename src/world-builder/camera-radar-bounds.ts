type Point = { x: number; y: number; z: number };
export interface CameraRadarBounds {
  horizontal: number;
  minHeight: number;
  maxHeight: number;
}

/** Keep the familiar small-scene view and fit larger or below-ground travel. */
export function cameraRadarBounds(poses: Point[]): CameraRadarBounds {
  return {
    horizontal: Math.max(
      28,
      ...poses.map((pose) => Math.hypot(pose.x, pose.z)),
    ),
    minHeight: Math.min(0, ...poses.map((pose) => pose.y)),
    maxHeight: Math.max(26, ...poses.map((pose) => pose.y)),
  };
}

export function projectRadarPose(
  pose: Point,
  mode: "top" | "side",
  width: number,
  height: number,
  bounds: CameraRadarBounds,
) {
  if (mode === "top") {
    const scale = Math.min(width - 28, height - 28) / (bounds.horizontal * 2);
    return { x: width / 2 + pose.x * scale, y: height / 2 + pose.z * scale };
  }
  return {
    x: width / 2 + (pose.z * (width - 28)) / (bounds.horizontal * 2),
    y:
      height -
      20 -
      ((pose.y - bounds.minHeight) * (height - 36)) /
        (bounds.maxHeight - bounds.minHeight),
  };
}
