export const DISPLAY_DIMENSIONS: Readonly<
  Record<string, readonly [number, number, number]>
>;
export interface CameraView {
  fov: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  minDistance: number;
  maxDistance: number;
}
export const CAMERA_VIEWS: Readonly<{
  standard: CameraView;
  compact: CameraView;
}>;
export function getCameraView(compact?: boolean): CameraView;
export function getDisplayDimensions(state: {
  space_mode: string;
  room_preset: string;
}): readonly [number, number, number];
