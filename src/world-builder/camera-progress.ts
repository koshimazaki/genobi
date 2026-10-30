/**
 * camera-progress — allocation-free bus for the camera move's interpolation
 * state. CameraControls (inside the Canvas, useFrame) writes here every frame;
 * the CameraOpsPanel motion radar reads it via rAF into DOM refs. Never put this
 * in React state — it updates at frame rate.
 */
export const CAMERA_PROGRESS_MAX_LAYERS = 4;
export type CameraProgressVec3 = [number, number, number];

type Vec3Like = { x: number; y: number; z: number };

export interface CameraProgress {
  /** True while a cinematic move is interpolating (false on hold/idle). */
  active: boolean;
  /** 0..1 interpolation progress of the active move. */
  progress: number;
  /** The move currently playing/held, or null. */
  moveKey: string | null;
  /** True when follow/orbit shots are being layered as an additive camera combo. */
  comboActive: boolean;
  /** True when the camera controller has published live world-space vectors. */
  hasSpatial: boolean;
  /** World-space camera position at move start. */
  startPosition: CameraProgressVec3;
  /** Current world-space camera position. */
  currentPosition: CameraProgressVec3;
  /** Current world-space move target/end position. */
  targetPosition: CameraProgressVec3;
  /** Number of active combo layers written into the fixed arrays below. */
  comboLayerCount: number;
  comboLayerKeys: Array<string | null>;
  comboLayerProgress: number[];
  comboLayerWeights: number[];
}

export const cameraProgress: CameraProgress = {
  active: false,
  progress: 0,
  moveKey: null,
  comboActive: false,
  hasSpatial: false,
  startPosition: [0, 5, 10],
  currentPosition: [0, 5, 10],
  targetPosition: [0, 5, 10],
  comboLayerCount: 0,
  comboLayerKeys: Array.from(
    { length: CAMERA_PROGRESS_MAX_LAYERS },
    () => null,
  ),
  comboLayerProgress: Array.from(
    { length: CAMERA_PROGRESS_MAX_LAYERS },
    () => 0,
  ),
  comboLayerWeights: Array.from(
    { length: CAMERA_PROGRESS_MAX_LAYERS },
    () => 0,
  ),
};

export function writeCameraProgressSpatial(
  start: Vec3Like,
  current: Vec3Like,
  target: Vec3Like,
): void {
  cameraProgress.hasSpatial = true;
  copyVec3(start, cameraProgress.startPosition);
  copyVec3(current, cameraProgress.currentPosition);
  copyVec3(target, cameraProgress.targetPosition);
}

export function writeCameraProgressCurrent(current: Vec3Like): void {
  if (!cameraProgress.hasSpatial) {
    copyVec3(current, cameraProgress.startPosition);
    copyVec3(current, cameraProgress.targetPosition);
  }
  cameraProgress.hasSpatial = true;
  copyVec3(current, cameraProgress.currentPosition);
}

export function clearCameraProgressSpatial(): void {
  cameraProgress.hasSpatial = false;
}

export function clearCameraComboProgress(): void {
  cameraProgress.comboActive = false;
  cameraProgress.comboLayerCount = 0;
  for (let i = 0; i < CAMERA_PROGRESS_MAX_LAYERS; i += 1) {
    cameraProgress.comboLayerKeys[i] = null;
    cameraProgress.comboLayerProgress[i] = 0;
    cameraProgress.comboLayerWeights[i] = 0;
  }
}

function copyVec3(source: Vec3Like, target: CameraProgressVec3): void {
  target[0] = source.x;
  target[1] = source.y;
  target[2] = source.z;
}
