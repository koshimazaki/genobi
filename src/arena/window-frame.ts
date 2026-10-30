/** The enlarged comparison's window: where it sits and how big it is, in CSS pixels. */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Viewport {
  width: number;
  height: number;
}

/** Smallest window that still shows a clip and the transport. */
export const MIN_FRAME = { width: 320, height: 260 };
/** At or under this width the window fills the screen and cannot be moved. */
export const COMPACT_WIDTH = 540;
/** How far one arrow press moves or resizes; Shift moves further. */
export const KEY_STEP = 16;
export const KEY_STEP_LARGE = 64;

export const isCompact = (viewport: Viewport) =>
  viewport.width <= COMPACT_WIDTH;

/** The opening window: as large as the old lightbox, centred. */
export function defaultFrame(viewport: Viewport): Frame {
  const width = Math.min(1600, Math.round(viewport.width * 0.96));
  const height = Math.round(viewport.height * 0.94);
  return clampFrame(
    {
      x: Math.round((viewport.width - width) / 2),
      y: Math.round((viewport.height - height) / 2),
      width,
      height,
    },
    viewport,
  );
}

/**
 * Keep the window on screen: never smaller than the minimum (or the screen,
 * if that is smaller), never larger than the screen, never off an edge.
 */
export function clampFrame(frame: Frame, viewport: Viewport): Frame {
  const width = Math.min(
    viewport.width,
    Math.max(Math.min(MIN_FRAME.width, viewport.width), frame.width),
  );
  const height = Math.min(
    viewport.height,
    Math.max(Math.min(MIN_FRAME.height, viewport.height), frame.height),
  );
  return {
    width: Math.round(width),
    height: Math.round(height),
    x: Math.round(Math.min(Math.max(0, frame.x), viewport.width - width)),
    y: Math.round(Math.min(Math.max(0, frame.y), viewport.height - height)),
  };
}

export const moveFrame = (
  frame: Frame,
  dx: number,
  dy: number,
  viewport: Viewport,
) => clampFrame({ ...frame, x: frame.x + dx, y: frame.y + dy }, viewport);

/** Resize from the bottom-right corner; the top-left corner stays put. */
export function resizeFrame(
  frame: Frame,
  dw: number,
  dh: number,
  viewport: Viewport,
): Frame {
  const width = Math.min(viewport.width - frame.x, frame.width + dw);
  const height = Math.min(viewport.height - frame.y, frame.height + dh);
  return clampFrame({ ...frame, width, height }, viewport);
}

/** The step an arrow key asks for, or null for any other key. */
export function keyStep(key: string, large: boolean): [number, number] | null {
  const step = large ? KEY_STEP_LARGE : KEY_STEP;
  switch (key) {
    case "ArrowLeft":
      return [-step, 0];
    case "ArrowRight":
      return [step, 0];
    case "ArrowUp":
      return [0, -step];
    case "ArrowDown":
      return [0, step];
    default:
      return null;
  }
}
