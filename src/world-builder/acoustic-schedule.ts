import { validateRecipe, type Recipe } from "./recipe";
import { TAKE_FRAMES } from "./take-duration";
import {
  evaluateAcousticEnvironment,
  type AcousticZoneEvidence,
} from "./evaluate-acoustic-environment";
import {
  ROOM_SAMPLING_TOLERANCE_METERS,
  acousticBoundaryKey,
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
  /** Explicit dry outside space has no enclosed-room IR or RT60. */
  room: AcousticRoom | null;
  zone?: AcousticZoneEvidence;
  /** Hold the previous environment until this exact boundary frame. */
  transition?: "hold";
}
export interface AcousticSchedule {
  version: 1;
  engine: typeof ROOM_AUDIO_ENGINE;
  treatment: "static" | "dynamic";
  /** Exactly the picture's frame grid, including its final frame duration. */
  frames: number;
  fps: 24;
  duration: number;
  sampleEveryFrames: number;
  maxIRSeconds: number;
  interpolation: "linear-wet-crossfade";
  controlAudio: "frozen-recipe-envelopes";
  approximation?: AcousticApproximation;
  snapshots: AcousticSnapshot[];
}
export interface AcousticScheduleOptions {
  sampleEveryFrames?: number;
  maxSnapshots?: number;
  maxIRSeconds?: number;
  static?: boolean;
}
export const MAX_ACOUSTIC_SNAPSHOTS = 24;

/** Same world geometry and listener clock as the picture; no inferred rooms. */
export function buildAcousticSchedule(
  input: Recipe,
  options: AcousticScheduleOptions = {},
): AcousticSchedule {
  const recipe = validateRecipe(input);
  if (!recipe.motion?.room && !recipe.motion?.acousticZones)
    throw new Error(
      "Choose a preset with an explicit acoustic room or acoustic zones.",
    );
  const requested = options.sampleEveryFrames ?? 12;
  const max = options.maxSnapshots ?? MAX_ACOUSTIC_SNAPSHOTS;
  const maxIRSeconds = options.maxIRSeconds ?? 4;
  if (
    !Number.isInteger(requested) ||
    requested < 1 ||
    requested > TAKE_FRAMES.max - 1 ||
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
    const environment = evaluateAcousticEnvironment(recipe, frame);
    if (environment.room) validateAcousticRoom(environment.room);
    return { frame, room: environment.room, zone: environment.zone };
  };
  const all = options.static
    ? [snapshotAt(0)]
    : Array.from({ length: recipe.frames }, (_, frame) => snapshotAt(frame));
  const key = (snapshot: AcousticSnapshot) =>
    acousticBoundaryKey(snapshot) +
    (snapshot.room ? roomGeometryKey(snapshot.room) : "dry");
  const firstKey = key(all[0]);
  const staticRoom = all.every((snapshot) => key(snapshot) === firstKey);
  const authored = [
    ...new Set([
      ...(recipe.motion?.stateKeys.map((entry) => entry.frame) ?? []),
      ...(recipe.motion?.acousticZones
        ? (recipe.cameraMotion?.keys.map((entry) => entry.frame) ?? [])
        : []),
    ]),
  ];
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
            boundaryFramesRetained: 0,
            boundaryFramesTotal: 0,
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

/** Validate external receipts before allocating IR or PCM buffers. */
export function validateAcousticSchedule(schedule: AcousticSchedule) {
  if (
    !schedule ||
    schedule.version !== 1 ||
    schedule.engine !== ROOM_AUDIO_ENGINE ||
    !["static", "dynamic"].includes(schedule.treatment) ||
    schedule.fps !== 24 ||
    !Number.isInteger(schedule.frames) ||
    schedule.frames < TAKE_FRAMES.min ||
    schedule.frames > TAKE_FRAMES.max ||
    (schedule.frames - 1) % 8 !== 0 ||
    schedule.duration !== schedule.frames / schedule.fps ||
    !Number.isFinite(schedule.maxIRSeconds) ||
    schedule.maxIRSeconds < 0.1 ||
    schedule.maxIRSeconds > 6 ||
    !Number.isInteger(schedule.sampleEveryFrames) ||
    schedule.sampleEveryFrames < 1 ||
    schedule.sampleEveryFrames > TAKE_FRAMES.max - 1 ||
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
      snapshot.frame >= schedule.frames ||
      (snapshot.transition !== undefined && snapshot.transition !== "hold")
    )
      throw new Error(
        "Acoustic snapshots must follow the picture's ordered frame grid.",
      );
    if (snapshot.room) validateAcousticRoom(snapshot.room);
    else if (
      !snapshot.zone ||
      !["outdoor", "outside"].includes(snapshot.zone.kind)
    )
      throw new Error(
        "Dry acoustic snapshots need an explicit outdoor or outside zone.",
      );
    const zone = snapshot.zone;
    if (
      zone &&
      (!["room", "outdoor", "outside"].includes(zone.kind) ||
        typeof zone.label !== "string" ||
        !zone.label.trim() ||
        zone.label.length > 72 ||
        (zone.kind === "outside"
          ? zone.id !== null
          : typeof zone.id !== "string" ||
            !/^[a-zA-Z0-9][\w-]{0,47}$/.test(zone.id)) ||
        (zone.kind === "room"
          ? !snapshot.room || zone.id !== snapshot.room.id
          : snapshot.room !== null ||
            zone.approximation !== undefined ||
            zone.openingsAreaM2 !== undefined) ||
        (zone.approximation !== undefined &&
          !["shoebox", "open-shaft-proxy"].includes(zone.approximation)) ||
        (zone.openingsAreaM2 !== undefined &&
          (!Number.isFinite(zone.openingsAreaM2) || zone.openingsAreaM2 < 0)))
    )
      throw new Error("Invalid acoustic zone evidence.");
    previous = snapshot.frame;
  }
  if (
    schedule.snapshots[0].frame !== 0 ||
    (schedule.treatment === "dynamic" &&
      (schedule.snapshots.length < 2 || previous !== schedule.frames - 1)) ||
    (schedule.treatment === "static" && schedule.snapshots.length !== 1)
  )
    throw new Error("Acoustic schedule must cover the complete scene.");
  for (let i = 1; i < schedule.snapshots.length; i++) {
    const from = schedule.snapshots[i - 1],
      to = schedule.snapshots[i];
    if ((!from.zone || !to.zone) && from.room?.id !== to.room?.id)
      throw new Error(
        "Changing acoustic enclosure identity needs explicit zone evidence.",
      );
    if (
      acousticBoundaryKey(from) !== acousticBoundaryKey(to) &&
      to.transition !== "hold"
    )
      throw new Error(
        "Acoustic zone and material boundaries must hold until their exact frame.",
      );
  }
  if (schedule.approximation !== undefined) {
    validateAcousticApproximation(schedule.approximation, schedule.frames);
    if (
      schedule.approximation.authoredFramesRetained >
        schedule.snapshots.length ||
      (schedule.approximation.boundaryFramesRetained ?? 0) >
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

export function acousticMixAt(
  from: AcousticSnapshot,
  to: AcousticSnapshot,
  frame: number,
) {
  return to.transition === "hold"
    ? frame >= to.frame
      ? 1
      : 0
    : (frame - from.frame) / (to.frame - from.frame);
}

/** Wet weights preserve final tails; explicit dry snapshots contribute no IR. */
export function acousticWeightsAt(schedule: AcousticSchedule, seconds: number) {
  const frames = schedule.snapshots;
  if (frames.length === 1 || seconds <= 0) return [{ index: 0, weight: 1 }];
  const frame = seconds * schedule.fps,
    last = frames.length - 1;
  if (frame >= frames[last].frame) return [{ index: last, weight: 1 }];
  const right = frames.findIndex((entry) => entry.frame > frame),
    left = Math.max(0, right - 1);
  const mix = acousticMixAt(frames[left], frames[right], frame);
  return [
    { index: left, weight: 1 - mix },
    { index: right, weight: mix },
  ];
}
