import { evaluateScene } from "./evaluate-scene";
import { validateRecipe, type Recipe } from "./recipe";
import { TAKE_FPS, TAKE_FRAMES } from "./take-duration";
import {
  ROOM_SAMPLING_TOLERANCE_METERS,
  selectAcousticSnapshots,
  validateAcousticApproximation,
  type AcousticApproximation,
} from "./acoustic-sampling";
import {
  ROOM_AUDIO_ENGINE,
  roomGeometryKey,
  validateAcousticRoom,
  type AcousticRoom,
} from "./scene-room-ir";

export interface AcousticSnapshot {
  frame: number;
  room: AcousticRoom;
}
export interface AcousticSchedule {
  version: 1;
  engine: typeof ROOM_AUDIO_ENGINE;
  treatment: "static" | "dynamic";
  /** Exactly the picture's frame grid, including its final frame duration. */
  frames: number;
  fps: typeof TAKE_FPS;
  duration: number;
  /** Initial uniform spacing; adaptive snapshots can add or replace knots. */
  sampleEveryFrames: number;
  maxIRSeconds: number;
  interpolation: "linear-wet-crossfade";
  controlAudio: "frozen-recipe-envelopes";
  /** Present on builder-created schedules; older explicit schedules may omit it. */
  approximation?: AcousticApproximation;
  snapshots: AcousticSnapshot[];
}
export interface AcousticScheduleOptions {
  sampleEveryFrames?: number;
  maxSnapshots?: number;
  maxIRSeconds?: number;
  /** A static treatment uses frame zero, including its authored control value. */
  static?: boolean;
}
export const MAX_ACOUSTIC_SNAPSHOTS = 24;

/**
 * Each room comes from the preview/capture evaluator after authored animation
 * and bounded control audio. Decorative voxels are never guessed into a room.
 */
export function buildAcousticSchedule(
  input: Recipe,
  options: AcousticScheduleOptions = {},
): AcousticSchedule {
  const recipe = validateRecipe(input);
  const requested = options.sampleEveryFrames ?? 12;
  const max = options.maxSnapshots ?? MAX_ACOUSTIC_SNAPSHOTS;
  const maxIRSeconds = options.maxIRSeconds ?? 4;
  if (
    !Number.isInteger(requested) ||
    requested < 1 ||
    requested >= TAKE_FRAMES.max ||
    !Number.isInteger(max) ||
    max < 2 ||
    max > MAX_ACOUSTIC_SNAPSHOTS ||
    !Number.isFinite(maxIRSeconds) ||
    maxIRSeconds < 0.1 ||
    maxIRSeconds > 6
  )
    throw new Error("Invalid acoustic schedule sampling or IR limit.");
  const step = Math.max(requested, Math.ceil((recipe.frames - 1) / (max - 1)));
  const frames = [0];
  if (!options.static) {
    for (let frame = step; frame < recipe.frames - 1; frame += step)
      frames.push(frame);
    frames.push(recipe.frames - 1);
  }
  const snapshotAt = (frame: number): AcousticSnapshot => {
    const evaluated = evaluateScene(recipe, frame).room;
    if (!evaluated)
      throw new Error(
        "Choose a preset with an explicit acoustic room or add one to the scene.",
      );
    const room: AcousticRoom = structuredClone({
      id: evaluated.id,
      dimensions: evaluated.dimensions,
      center: evaluated.center,
      source: evaluated.source,
      listener: evaluated.listener,
      absorption: evaluated.absorption,
      seed: evaluated.seed,
    });
    validateAcousticRoom(room);
    return { frame, room };
  };
  const all = options.static
    ? [snapshotAt(0)]
    : Array.from({ length: recipe.frames }, (_, frame) => snapshotAt(frame));
  const firstKey = roomGeometryKey(all[0].room);
  // Compare the complete grid before collapsing: uniform samples can alias bass.
  const staticRoom = all.every((s) => roomGeometryKey(s.room) === firstKey);
  const authored = recipe.motion?.stateKeys.map((key) => key.frame) ?? [];
  const sampled =
    options.static || staticRoom
      ? {
          snapshots: [all[0]],
          approximation: {
            method: options.static
              ? ("frame-zero" as const)
              : ("adaptive-room-inputs" as const),
            comparedFrames: all.length,
            toleranceMeters: ROOM_SAMPLING_TOLERANCE_METERS,
            maxErrorMeters: options.static ? null : 0,
            largestErrorFrame: options.static ? null : 0,
            budgetLimited: false,
            authoredFramesRetained: authored.includes(0) ? 1 : 0,
            authoredFramesTotal: authored.length,
          },
        }
      : selectAcousticSnapshots(all, frames, authored, max);
  return {
    version: 1,
    engine: ROOM_AUDIO_ENGINE,
    treatment: staticRoom ? "static" : "dynamic",
    frames: recipe.frames,
    fps: recipe.fps,
    duration: recipe.frames / recipe.fps,
    sampleEveryFrames: step,
    maxIRSeconds,
    interpolation: "linear-wet-crossfade",
    controlAudio: "frozen-recipe-envelopes",
    snapshots: sampled.snapshots,
    approximation: sampled.approximation,
  };
}

/** Validate before allocating render buffers, also for restored/exported JSON. */
export function validateAcousticSchedule(schedule: AcousticSchedule) {
  if (
    !schedule ||
    schedule.version !== 1 ||
    schedule.engine !== ROOM_AUDIO_ENGINE ||
    !["static", "dynamic"].includes(schedule.treatment) ||
    schedule.fps !== TAKE_FPS ||
    !Number.isInteger(schedule.frames) ||
    schedule.frames < TAKE_FRAMES.min ||
    schedule.frames > TAKE_FRAMES.max ||
    (schedule.frames - 1) % TAKE_FRAMES.step !== 0 ||
    schedule.duration !== schedule.frames / schedule.fps ||
    !Number.isFinite(schedule.maxIRSeconds) ||
    schedule.maxIRSeconds < 0.1 ||
    schedule.maxIRSeconds > 6 ||
    !Number.isInteger(schedule.sampleEveryFrames) ||
    schedule.sampleEveryFrames < 1 ||
    schedule.sampleEveryFrames >= TAKE_FRAMES.max ||
    schedule.interpolation !== "linear-wet-crossfade" ||
    schedule.controlAudio !== "frozen-recipe-envelopes" ||
    !Array.isArray(schedule.snapshots) ||
    !schedule.snapshots.length ||
    schedule.snapshots.length > MAX_ACOUSTIC_SNAPSHOTS
  )
    throw new Error("Invalid acoustic schedule.");
  let previous = -1;
  for (const snapshot of schedule.snapshots) {
    if (
      !snapshot ||
      !Number.isInteger(snapshot.frame) ||
      snapshot.frame <= previous ||
      snapshot.frame >= schedule.frames
    )
      throw new Error(
        "Acoustic snapshots must follow the picture's ordered frame grid.",
      );
    validateAcousticRoom(snapshot.room);
    previous = snapshot.frame;
  }
  if (
    schedule.snapshots[0].frame !== 0 ||
    (schedule.treatment === "dynamic" &&
      (schedule.snapshots.length < 2 || previous !== schedule.frames - 1)) ||
    (schedule.treatment === "static" && schedule.snapshots.length !== 1)
  )
    throw new Error("Acoustic schedule must cover the complete scene.");
  if (
    schedule.snapshots.some((s) => s.room.id !== schedule.snapshots[0].room.id)
  )
    throw new Error(
      "Changing acoustic enclosure identity is not supported in one schedule.",
    );
  if (schedule.approximation !== undefined) {
    validateAcousticApproximation(schedule.approximation, schedule.frames);
    if (
      schedule.approximation.authoredFramesRetained >
        schedule.snapshots.length ||
      (schedule.approximation.method === "frame-zero" &&
        schedule.treatment !== "static")
    )
      throw new Error(
        "Acoustic sampling evidence disagrees with its schedule.",
      );
  }
  return schedule;
}

/** Adjacent wet outputs always sum to one, including the final decay hold. */
export function acousticWeightsAt(schedule: AcousticSchedule, seconds: number) {
  const frames = schedule.snapshots;
  if (frames.length === 1 || seconds <= 0) return [{ index: 0, weight: 1 }];
  const frame = seconds * schedule.fps;
  const last = frames.length - 1;
  if (frame >= frames[last].frame) return [{ index: last, weight: 1 }];
  const right = frames.findIndex((entry) => entry.frame > frame);
  const left = Math.max(0, right - 1);
  const mix =
    (frame - frames[left].frame) / (frames[right].frame - frames[left].frame);
  return [
    { index: left, weight: 1 - mix },
    { index: right, weight: mix },
  ];
}
