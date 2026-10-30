/**
 * The playblast: a rendered clip of a 3D scene along a camera plate. It lands
 * in the Director as an asset and is the layout guide for LTX Layout to Render
 * later (#18). This module holds the portable parts: the frame grid and sizes
 * a playblast is rendered on, and the receipt written into the clip's metadata
 * so the camera path travels with the video in the shared format.
 *
 * Nothing here sends a playblast to a model.
 */
import {
  parseCreatureReference,
  type CreatureReference,
} from "./scene/creature-reference";
import { isCameraEase, type CameraEaseKey } from "./camera-ease";
import { validateCameraPath, type CameraPath } from "./camera-path";
import { LTX_DURATIONS } from "./comfy/ltx";

export const PLAYBLAST_FORMAT = "genobi.playblast";
export const PLAYBLAST_VERSION = 1;
/** World Builder's take rate; LTX takes 24 fps. */
export const PLAYBLAST_FPS = 24;
/** World Builder's frame grid: 8k+1 frames from 9 to 241. */
export const PLAYBLAST_FRAME_LIMITS = { min: 9, max: 241 } as const;
/** Receipt text bound, in characters. A 241-key path stays well inside it. */
export const PLAYBLAST_RECEIPT_LIMIT = 96 * 1024;

/**
 * Sizes on a 64-pixel grid: 1920 × 1088 is the Layout to Render guide size
 * noted on #18; 1280 × 704 is the quicker draft at the nearest grid height
 * to 720.
 */
export const PLAYBLAST_SIZES = [
  { id: "draft", label: "1280 × 704", width: 1280, height: 704 },
  { id: "full", label: "1920 × 1088", width: 1920, height: 1088 },
] as const;
export type PlayblastSize = (typeof PLAYBLAST_SIZES)[number];

/** The 8k+1 frame count closest to `seconds` at `fps`, within the grid. */
export function playblastFrames(seconds: number, fps = PLAYBLAST_FPS): number {
  const steps = Math.round((Math.max(0, seconds) * fps) / 8);
  const { min, max } = PLAYBLAST_FRAME_LIMITS;
  return Math.min(max, Math.max(min, steps * 8 + 1));
}

/** LTX's offered durations whose frame grid fits a playblast. */
export const PLAYBLAST_SECONDS: readonly number[] = LTX_DURATIONS.filter(
  (s) => s * PLAYBLAST_FPS + 1 <= PLAYBLAST_FRAME_LIMITS.max,
);
export const PLAYBLAST_DEFAULT_SECONDS = 5;

export interface PlayblastReceipt {
  format: typeof PLAYBLAST_FORMAT;
  version: typeof PLAYBLAST_VERSION;
  /** Scene, plate and gesture ids from the 3D section's data. */
  scene: string;
  plate: string;
  gestures: string[];
  ease: CameraEaseKey;
  fps: number;
  frames: number;
  width: number;
  height: number;
  /** One key per frame, so the path replays the clip exactly. */
  cameraPath: CameraPath;
  /** Local character/motion fingerprints, when used. No asset files. */
  creature?: CreatureReference;
}

export class PlayblastReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayblastReceiptError";
  }
}

const FIELDS = [
  "format",
  "version",
  "scene",
  "plate",
  "gestures",
  "ease",
  "fps",
  "frames",
  "width",
  "height",
  "cameraPath",
  "creature",
];
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_GESTURES = 8;

function id(value: unknown, name: string): string {
  if (typeof value !== "string" || !ID.test(value))
    throw new PlayblastReceiptError(`${name} must be a short lowercase id.`);
  return value;
}

/** Validate untrusted input and return a canonical copy. */
export function validatePlayblastReceipt(input: unknown): PlayblastReceipt {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new PlayblastReceiptError("Expected a playblast receipt object.");
  const r = input as Record<string, unknown>;
  if (Object.keys(r).some((k) => !FIELDS.includes(k)))
    throw new PlayblastReceiptError("Playblast receipt has an unknown field.");
  if (r.format !== PLAYBLAST_FORMAT || r.version !== PLAYBLAST_VERSION)
    throw new PlayblastReceiptError("Unsupported playblast receipt.");
  const gestures = r.gestures;
  if (!Array.isArray(gestures) || gestures.length > MAX_GESTURES)
    throw new PlayblastReceiptError(`Use at most ${MAX_GESTURES} gesture ids.`);
  const ids = gestures.map((g) => id(g, "Gesture"));
  if (new Set(ids).size !== ids.length)
    throw new PlayblastReceiptError("Gesture ids must be unique.");
  if (!isCameraEase(r.ease))
    throw new PlayblastReceiptError("Playblast receipt has an unknown ease.");
  if (r.fps !== PLAYBLAST_FPS)
    throw new PlayblastReceiptError(`Playblasts run at ${PLAYBLAST_FPS} fps.`);
  const frames = r.frames;
  if (
    typeof frames !== "number" ||
    !Number.isInteger(frames) ||
    frames < PLAYBLAST_FRAME_LIMITS.min ||
    frames > PLAYBLAST_FRAME_LIMITS.max ||
    (frames - 1) % 8 !== 0
  )
    throw new PlayblastReceiptError("Frames must be 8k+1, from 9 to 241.");
  if (
    !PLAYBLAST_SIZES.some((s) => s.width === r.width && s.height === r.height)
  )
    throw new PlayblastReceiptError("Unsupported playblast size.");
  let cameraPath: CameraPath;
  try {
    cameraPath = validateCameraPath(r.cameraPath);
  } catch (error) {
    throw new PlayblastReceiptError(
      `Camera path: ${error instanceof Error ? error.message : "invalid"}`,
    );
  }
  const span = (frames - 1) / PLAYBLAST_FPS;
  if (Math.abs(cameraPath.duration - span) > 1e-6)
    throw new PlayblastReceiptError(
      "Camera path duration must match the frame grid.",
    );
  return {
    format: PLAYBLAST_FORMAT,
    version: PLAYBLAST_VERSION,
    scene: id(r.scene, "Scene"),
    plate: id(r.plate, "Plate"),
    gestures: ids,
    ease: r.ease,
    fps: PLAYBLAST_FPS,
    frames,
    width: r.width as number,
    height: r.height as number,
    cameraPath,
    ...(r.creature === undefined
      ? {}
      : { creature: parseCreatureReference(r.creature) }),
  };
}

/** Receipt text for the clip's metadata comment. Validates first. */
export function writePlayblastReceipt(receipt: PlayblastReceipt): string {
  const text = JSON.stringify(validatePlayblastReceipt(receipt));
  if (text.length > PLAYBLAST_RECEIPT_LIMIT)
    throw new PlayblastReceiptError("Playblast receipt is too large.");
  return text;
}

/** Read receipt text back from a clip's metadata comment. */
export function readPlayblastReceipt(text: string): PlayblastReceipt {
  if (typeof text !== "string" || text.length > PLAYBLAST_RECEIPT_LIMIT)
    throw new PlayblastReceiptError(
      "Playblast receipt is missing or too large.",
    );
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new PlayblastReceiptError("Playblast receipt is not JSON.");
  }
  return validatePlayblastReceipt(value);
}
