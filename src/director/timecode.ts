export type TimeUnits = "frames" | "time";

/** Frames read as seconds:frames; time reads as seconds to the millisecond. */
export function timecode(
  frame: number,
  fps: number,
  units: TimeUnits,
  secondDigits = 1,
) {
  if (units === "time") return `${(frame / fps).toFixed(3)}s`;
  return `${String(Math.floor(frame / fps)).padStart(secondDigits, "0")}:${String(frame % fps).padStart(2, "0")}`;
}

/** Ruler sub-second label: a frame number or a millisecond offset. */
export function subLabel(frame: number, fps: number, units: TimeUnits) {
  const within = frame % fps;
  return units === "time"
    ? `.${String(Math.round((within / fps) * 1000)).padStart(3, "0")}`
    : `+${String(within).padStart(2, "0")}`;
}
