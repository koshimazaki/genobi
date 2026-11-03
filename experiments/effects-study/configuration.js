/** A saved combination is a complete contract, not a partial live control patch. */
import { FPS, FRAMES, SOURCE } from "./render.js";
const modes = ["helmet", "mirror", "terrain"];
const keys = [
  "schema",
  "mode",
  "intensity",
  "frame",
  "fps",
  "frames",
  "width",
  "height",
  "source",
];
const exact = (value, names) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === names.length &&
  names.every((name) => Object.hasOwn(value, name));
export function readConfiguration(value) {
  if (!exact(value, keys) || value.schema !== "genobi.effects-study.v1")
    throw new Error("Choose a complete effects-study combination.");
  if (
    !modes.includes(value.mode) ||
    !Number.isFinite(value.intensity) ||
    value.intensity < 0 ||
    value.intensity > 1 ||
    !Number.isInteger(value.frame) ||
    value.frame < 0 ||
    value.frame >= FRAMES
  )
    throw new Error("The saved mode, intensity or frame is invalid.");
  if (
    value.fps !== FPS ||
    value.frames !== FRAMES ||
    value.width !== 960 ||
    value.height !== 540 ||
    !exact(value.source, Object.keys(SOURCE)) ||
    Object.entries(SOURCE).some(
      ([key, expected]) => value.source[key] !== expected,
    )
  )
    throw new Error(
      "This combination uses a different source or render format.",
    );
  return { mode: value.mode, intensity: value.intensity, frame: value.frame };
}
