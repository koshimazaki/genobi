export const DISPLAY_DIMENSIONS = Object.freeze({
  dry: [3.8, 4.8, 2.25],
  small_room: [2.35, 3.1, 1.5],
  empty_club: [4.82, 6.2, 2.48],
  medium_room: [6.2, 9.3, 2.9],
  cathedral: [8.2, 12.4, 6.8],
  dual_delay: [5.8, 9.6, 3.2],
  outside: [7.2, 11.5, 0],
});

export const CAMERA_VIEWS = Object.freeze({
  standard: Object.freeze({
    fov: 38,
    position: Object.freeze([7.5, 6.4, 8.5]),
    target: Object.freeze([0, 1.1, 0]),
    minDistance: 4.2,
    maxDistance: 18,
  }),
  compact: Object.freeze({
    fov: 44,
    position: Object.freeze([10.1, 8.13, 11.42]),
    target: Object.freeze([0, 1.35, 0]),
    minDistance: 4.8,
    maxDistance: 22,
  }),
});

export function getCameraView(compact = false) {
  return compact ? CAMERA_VIEWS.compact : CAMERA_VIEWS.standard;
}

export function getDisplayDimensions(state) {
  if (state.space_mode === "dry") return DISPLAY_DIMENSIONS.dry;
  if (state.space_mode === "outside") return DISPLAY_DIMENSIONS.outside;
  if (state.space_mode === "sfx") return DISPLAY_DIMENSIONS.dual_delay;
  return (
    DISPLAY_DIMENSIONS[state.room_preset] ?? DISPLAY_DIMENSIONS.medium_room
  );
}
