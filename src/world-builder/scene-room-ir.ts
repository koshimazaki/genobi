/**
 * Browser CPU shoebox approximation, independent of AKUSPACE and native DSP.
 * Six surface image reflections plus a seeded, damped diffuse tail. Positions
 * are room-local, so moving the complete room cannot change its response.
 */
import { ROOM_DIMENSION_RANGE, roomPointInside } from "./scene-room";
import { ROOM_FACES, type RoomFace } from "./scene-state";

export const ROOM_AUDIO_ENGINE = "genobi-browser-shoebox-v1" as const;
export const ROOM_AUDIO_LABEL = "Geometry CPU · single-room approximation";
export const ROOM_SURFACES = ROOM_FACES;
export type RoomSurface = RoomFace;
export interface AcousticRoom {
  id: string;
  dimensions: [number, number, number];
  /** World floor centre; provenance only, never an input to local acoustics. */
  center: [number, number, number];
  /** Local x/z centred on the room; y measured upwards from the floor. */
  source: [number, number, number];
  listener: [number, number, number];
  absorption: Record<RoomSurface, number>;
  seed: number;
}
export interface RoomImpulse {
  samples: Float32Array;
  sampleRate: number;
  rt60: number;
  seconds: number;
  truncated: boolean;
  reflections: number;
}

const finite = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** Used again when consuming an exported schedule: never trust allocation inputs. */
export function validateAcousticRoom(room: AcousticRoom) {
  if (
    !room ||
    typeof room.id !== "string" ||
    !/^[a-zA-Z0-9][\w-]{0,47}$/.test(room.id)
  )
    throw new Error("An explicit single acoustic room is required.");
  if (
    !Array.isArray(room.dimensions) ||
    room.dimensions.length !== 3 ||
    !room.dimensions.every((v) => finite(v, ...ROOM_DIMENSION_RANGE)) ||
    !Array.isArray(room.center) ||
    room.center.length !== 3 ||
    !room.center.every((v) => finite(v, -40, 40)) ||
    !Number.isInteger(room.seed) ||
    !finite(room.seed, 0, 0xffffffff) ||
    !room.absorption ||
    !ROOM_SURFACES.every((surface) =>
      finite(room.absorption[surface], 0.01, 0.99),
    )
  )
    throw new Error("Invalid acoustic room dimensions, materials or seed.");
  for (const point of [room.source, room.listener])
    if (
      !Array.isArray(point) ||
      point.length !== 3 ||
      !point.every((v) => finite(v, -40, 40)) ||
      !roomPointInside(point, room.dimensions)
    )
      throw new Error(
        "Sound source and listener must be inside the acoustic room.",
      );
  return room;
}

/** Full acoustic inputs, with explicit property order; no rounding collisions. */
export function roomGeometryKey(room: AcousticRoom) {
  return JSON.stringify([
    room.dimensions,
    room.source,
    room.listener,
    ROOM_SURFACES.map((surface) => room.absorption[surface]),
    room.seed,
  ]);
}

export function roomImpulseKey(
  room: AcousticRoom,
  rate: number,
  maxSeconds: number,
) {
  return JSON.stringify([
    ROOM_AUDIO_ENGINE,
    rate,
    maxSeconds,
    roomGeometryKey(room),
  ]);
}

export function roomRt60(room: AcousticRoom) {
  const [w, h, d] = room.dimensions;
  const a = room.absorption;
  const sabins =
    w * d * (a.floor + a.ceiling) +
    w * h * (a.north + a.south) +
    d * h * (a.east + a.west);
  return (0.161 * w * h * d) / sabins;
}

/** mulberry32 with one seed per room, retained across geometry snapshots. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Delay relative to the direct arrival; direct sound belongs to the dry path. */
function imageReflections(room: AcousticRoom) {
  const dims = room.dimensions;
  const source = room.source.map((v, i) => v + (i === 1 ? 0 : dims[i] / 2));
  const listener = room.listener.map((v, i) => v + (i === 1 ? 0 : dims[i] / 2));
  const direct = Math.max(
    0.1,
    Math.hypot(...source.map((v, i) => v - listener[i])),
  );
  const a = room.absorption;
  const surfaces = [
    [a.west, a.east],
    [a.floor, a.ceiling],
    [a.north, a.south],
  ];
  const axes = dims.map((dim, axis) => {
    const options: { coordinate: number; order: number; gain: number }[] = [];
    for (let n = -3; n <= 3; n++)
      for (let flip = 0; flip <= 1; flip++) {
        const low = Math.abs(n - flip),
          high = Math.abs(n);
        if (low + high > 3) continue;
        options.push({
          coordinate: 2 * n * dim + (flip ? -source[axis] : source[axis]),
          order: low + high,
          gain:
            Math.sqrt(1 - surfaces[axis][0]) ** low *
            Math.sqrt(1 - surfaces[axis][1]) ** high,
        });
      }
    return options;
  });
  const out: { seconds: number; gain: number }[] = [];
  for (const x of axes[0])
    for (const y of axes[1])
      for (const z of axes[2]) {
        const order = x.order + y.order + z.order;
        if (order === 0 || order > 3) continue;
        const distance = Math.max(
          0.1,
          Math.hypot(
            x.coordinate - listener[0],
            y.coordinate - listener[1],
            z.coordinate - listener[2],
          ),
        );
        out.push({
          seconds: Math.max(0, (distance - direct) / 343),
          gain:
            ((x.gain * y.gain * z.gain * direct) / distance) *
            Math.exp(-0.0012 * Math.max(0, distance - direct)),
        });
      }
  return out;
}

/** Unit-energy mono IR. Web Audio normalisation must be disabled downstream. */
export function buildRoomImpulse(
  room: AcousticRoom,
  sampleRate: number,
  maxSeconds = 4,
): RoomImpulse {
  validateAcousticRoom(room);
  if (
    !Number.isInteger(sampleRate) ||
    !finite(sampleRate, 8000, 96000) ||
    !finite(maxSeconds, 0.1, 6)
  )
    throw new Error(
      "Room audio supports 8–96 kHz and IR limits of 0.1–6 seconds.",
    );
  const reflections = imageReflections(room);
  const rt60 = roomRt60(room);
  const earlyEnd = Math.max(0.02, ...reflections.map((r) => r.seconds));
  const naturalSeconds = earlyEnd + Math.max(0.05, rt60) * 1.2;
  const length = Math.max(
    16,
    Math.ceil(Math.min(maxSeconds, naturalSeconds) * sampleRate),
  );
  const early = new Float32Array(length),
    late = new Float32Array(length);
  for (const reflection of reflections) {
    // Linear sample interpolation avoids a whole-sample delay discontinuity.
    const at = reflection.seconds * sampleRate,
      first = Math.floor(at),
      mix = at - first;
    if (first < length) early[first] += reflection.gain * (1 - mix);
    if (first + 1 < length) early[first + 1] += reflection.gain * mix;
  }
  const rng = random(room.seed);
  let low = 0,
    earlyEnergy = 0,
    lateEnergy = 0;
  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    const cutoff = Math.max(
      250,
      Math.min(16000, sampleRate * 0.45) *
        10 ** ((-0.7 * time) / Math.max(0.05, rt60)),
    );
    low +=
      (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)) *
      (rng() * 2 - 1 - low);
    const attack = Math.max(
      0,
      Math.min(1, (time - Math.max(0, earlyEnd - 0.02)) / 0.02),
    );
    late[i] =
      low *
      Math.exp((-Math.log(1000) * time) / Math.max(0.05, rt60)) *
      (0.5 - 0.5 * Math.cos(Math.PI * attack));
    earlyEnergy += early[i] ** 2;
    lateEnergy += late[i] ** 2;
  }
  const earlyGain = earlyEnergy ? Math.sqrt(0.35 / earlyEnergy) : 0;
  const lateGain = lateEnergy ? Math.sqrt(0.65 / lateEnergy) : 0;
  const samples = new Float32Array(length);
  const fade = Math.min(length / 4, sampleRate * 0.05);
  let energy = 0;
  for (let i = 0; i < length; i++) {
    samples[i] =
      (early[i] * earlyGain + late[i] * lateGain) *
      Math.min(1, (length - 1 - i) / fade);
    energy += samples[i] ** 2;
  }
  if (energy > 0) {
    const gain = 1 / Math.sqrt(energy);
    for (let i = 0; i < length; i++) samples[i] *= gain;
  }
  return {
    samples,
    sampleRate,
    rt60,
    seconds: length / sampleRate,
    truncated: naturalSeconds > maxSeconds,
    reflections: reflections.length,
  };
}
