import type { AcousticSnapshot } from "./acoustic-schedule";
import { WORLD_POSITION_LIMIT } from "./scene-bounds";
import { ROOM_SURFACES } from "./scene-room-ir";

export const ROOM_SAMPLING_TOLERANCE_METERS = 0.05;

/** Error bounds describe room inputs, never perceptual or acoustic accuracy. */
export interface AcousticApproximation {
  method: "adaptive-room-inputs" | "frame-zero";
  comparedFrames: number;
  toleranceMeters: number;
  maxErrorMeters: number | null;
  largestErrorFrame: number | null;
  budgetLimited: boolean;
  authoredFramesRetained: number;
  authoredFramesTotal: number;
  boundaryFramesRetained?: number;
  boundaryFramesTotal?: number;
}

/** Material, seed, enclosure and outdoor changes cannot be interpolated away. */
export function acousticBoundaryKey(snapshot: AcousticSnapshot) {
  const { room, zone } = snapshot;
  return JSON.stringify([
    zone?.kind ?? (room ? "room" : "outside"),
    zone?.id ?? room?.id ?? null,
    room ? ROOM_SURFACES.map((face) => room.absorption[face]) : null,
    room?.seed ?? null,
  ]);
}

/** Keep both sides of every boundary, then authored keys and adaptive inputs. */
export function selectAcousticSnapshots(
  all: AcousticSnapshot[],
  uniformFrames: number[],
  authoredFrames: number[],
  maxSnapshots: number,
) {
  const final = all.length - 1;
  const authored = [...new Set(authoredFrames)]
    .filter((f) => f >= 0 && f <= final)
    .sort((a, b) => a - b);
  const boundary = new Set<number>();
  const jumps = new Set<number>();
  for (let frame = 1; frame <= final; frame++)
    if (
      acousticBoundaryKey(all[frame]) !== acousticBoundaryKey(all[frame - 1])
    ) {
      boundary.add(frame - 1);
      boundary.add(frame);
      jumps.add(frame);
    }
  const selected = new Set([0, final, ...boundary]);
  if (selected.size > maxSnapshots)
    throw new Error(
      "Acoustic zone/material boundaries exceed the snapshot budget. Simplify the path or increase the snapshot budget.",
    );
  for (const frame of authored)
    if (selected.size < maxSnapshots) selected.add(frame);
  const uniform = new Set([...selected, ...uniformFrames]);
  if (uniform.size <= maxSnapshots)
    for (const frame of uniform) selected.add(frame);

  const vectors = all.map(({ room }) =>
    room
      ? [...room.dimensions, ...room.source, ...room.listener, ...room.center]
      : Array<number>(12).fill(0),
  );
  function largestError() {
    const frames = [...selected].sort((a, b) => a - b);
    let maxErrorMeters = 0,
      largestErrorFrame = 0,
      right = 1;
    for (let frame = 0; frame <= final; frame++) {
      while (right < frames.length - 1 && frame > frames[right]) right++;
      const from = frames[right - 1],
        to = frames[right];
      const t = jumps.has(to)
        ? frame >= to
          ? 1
          : 0
        : (frame - from) / (to - from);
      let error = 0;
      for (let axis = 0; axis < vectors[frame].length; axis++) {
        const predicted =
          vectors[from][axis] + (vectors[to][axis] - vectors[from][axis]) * t;
        error = Math.max(error, Math.abs(vectors[frame][axis] - predicted));
      }
      if (error > maxErrorMeters) {
        maxErrorMeters = error;
        largestErrorFrame = frame;
      }
    }
    return { maxErrorMeters, largestErrorFrame };
  }
  let error = largestError();
  while (
    error.maxErrorMeters > ROOM_SAMPLING_TOLERANCE_METERS &&
    selected.size < maxSnapshots
  ) {
    selected.add(error.largestErrorFrame);
    error = largestError();
  }
  const approximation: AcousticApproximation = {
    method: "adaptive-room-inputs",
    comparedFrames: all.length,
    toleranceMeters: ROOM_SAMPLING_TOLERANCE_METERS,
    ...error,
    budgetLimited: error.maxErrorMeters > ROOM_SAMPLING_TOLERANCE_METERS,
    authoredFramesRetained: authored.filter((frame) => selected.has(frame))
      .length,
    authoredFramesTotal: authored.length,
    boundaryFramesRetained: boundary.size,
    boundaryFramesTotal: boundary.size,
  };
  return {
    snapshots: [...selected]
      .sort((a, b) => a - b)
      .map((frame) => ({
        ...all[frame],
        ...(jumps.has(frame) ? { transition: "hold" as const } : {}),
      })),
    approximation,
  };
}

export function validateAcousticApproximation(
  value: AcousticApproximation,
  frames: number,
) {
  const finite = (n: unknown, lo: number, hi: number): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
  if (
    !value ||
    !["adaptive-room-inputs", "frame-zero"].includes(value.method) ||
    value.toleranceMeters !== ROOM_SAMPLING_TOLERANCE_METERS ||
    typeof value.budgetLimited !== "boolean" ||
    !Number.isInteger(value.authoredFramesTotal) ||
    !finite(value.authoredFramesTotal, 0, 32) ||
    !Number.isInteger(value.authoredFramesRetained) ||
    !finite(value.authoredFramesRetained, 0, value.authoredFramesTotal) ||
    (value.boundaryFramesTotal !== undefined &&
      (!Number.isInteger(value.boundaryFramesTotal) ||
        !finite(value.boundaryFramesTotal, 0, frames))) ||
    (value.boundaryFramesRetained !== undefined &&
      (!Number.isInteger(value.boundaryFramesRetained) ||
        !finite(
          value.boundaryFramesRetained,
          0,
          value.boundaryFramesTotal ?? 0,
        )))
  )
    throw new Error("Invalid acoustic sampling evidence.");
  if (value.method === "frame-zero") {
    if (
      value.comparedFrames !== 1 ||
      value.maxErrorMeters !== null ||
      value.largestErrorFrame !== null ||
      value.budgetLimited
    )
      throw new Error("Invalid frame-zero acoustic sampling evidence.");
  } else if (
    value.comparedFrames !== frames ||
    !finite(value.maxErrorMeters, 0, WORLD_POSITION_LIMIT * 2) ||
    !Number.isInteger(value.largestErrorFrame) ||
    !finite(value.largestErrorFrame, 0, frames - 1) ||
    value.budgetLimited !== value.maxErrorMeters > value.toleranceMeters
  )
    throw new Error("Invalid full-frame acoustic sampling evidence.");
  return value;
}
