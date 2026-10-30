/**
 * `roomAcoustics`: a scene's room acoustics from its geometry, as a readout
 * and a portable object. Nothing here touches audio. The model is the
 * classical diffuse-field estimate: Sabine's RT60, Eyring's when the mean
 * absorption passes 0.2, and air absorption in large rooms. A box is not a
 * nave and props are rough, so the result is advisory (docs/scene-builder.md).
 */
import presets from "../akuspace-presets.json";
import {
  ABSORPTION,
  AIR,
  AIR_VOLUME,
  OCTAVE_BANDS,
  OPENING,
  SPEED_OF_SOUND,
} from "./absorption";
import { isBoundary, primitiveBounds, union, type Bounds } from "./bounds";
import { interiorFaces, type Face } from "./faces";
import type { ScenePrimitive, SceneSpec, Vec3 } from "./types";

export type RtFormula = "sabine" | "eyring";

export interface AcousticBand {
  hz: (typeof OCTAVE_BANDS)[number];
  /** Total absorption A in m² sabins, without air. */
  absorption: number;
  meanAlpha: number;
  rt60: number;
  formula: RtFormula;
  air: boolean;
}

export interface Reflection {
  surface: string;
  /** After the direct sound. */
  delayMs: number;
  /** Relative to the direct sound: the surface's mid-band (1 − α) and 1/r. */
  gain: number;
}

export interface Acoustics {
  volumeM3: number;
  surfaceM2: number;
  openingM2: number;
  interior: Bounds;
  bands: AcousticBand[];
  formula: RtFormula | "mixed";
  rt60Mid: number;
  brightness: number;
  criticalDistanceM: number;
  preDelayMs: number;
  listener: Vec3;
  earlyReflections: Reflection[];
  nearestPreset: { id: string; label: string; rt60: number; distanceS: number };
}

const round = (v: number, places = 3) => Number(v.toFixed(places));

/** Advisory comparison targets: AKUSPACE's room presets and their decay. */
export const ROOM_PRESETS = (
  ["small_room", "empty_club", "medium_room", "cathedral"] as const
).map((id) => {
  const p = (
    presets.presets as Record<string, { label: string; estimated_rt60: number }>
  )[id];
  return { id, label: p.label, rt60: p.estimated_rt60 };
});

/** Rough outer area of a prop, for its share of the absorption. */
export function primitiveArea(p: ScenePrimitive): number {
  const [x, y, z] = p.size;
  switch (p.shape) {
    case "box":
      return 2 * (x * y + y * z + x * z);
    case "sphere":
      return 4 * Math.PI * x * x;
    case "cylinder":
      return 2 * Math.PI * x * (x + y);
    case "cone":
      return Math.PI * x * (x + Math.hypot(x, y));
    case "icosahedron":
      // Edge a = r / sin(2π/5); area 5√3·a².
      return 5 * Math.sqrt(3) * (x / Math.sin((2 * Math.PI) / 5)) ** 2;
    case "torusKnot":
      // A tube of radius 0.22x along roughly 2.5 turns of radius 0.7x.
      return 2 * Math.PI * 0.22 * x * (2.5 * 2 * Math.PI * 0.7 * x);
  }
}

function clampInto(point: Vec3, b: Bounds): Vec3 {
  return point.map((v, i) => {
    const margin = Math.min(0.25, (b.max[i] - b.min[i]) / 4);
    return Math.min(b.max[i] - margin, Math.max(b.min[i] + margin, v));
  }) as Vec3;
}

const mid = (alpha: readonly number[]) => (alpha[2] + alpha[3]) / 2;

function faceAlpha(face: Face, band: number) {
  let sum = face.openingM2 * OPENING[band];
  for (const [material, area] of face.covered)
    sum += area * ABSORPTION[material][band];
  return sum;
}

function reflections(faces: Face[], s: Vec3, l: Vec3): Reflection[] {
  const direct = Math.max(0.01, Math.hypot(...s.map((v, i) => v - l[i])));
  return faces
    .filter((f) => f.covered.size)
    .map((f) => {
      const image = [...s] as Vec3;
      image[f.axis] = 2 * f.plane - s[f.axis];
      const r = Math.hypot(...image.map((v, i) => v - l[i]));
      const alpha = mid(OCTAVE_BANDS.map((_, b) => faceAlpha(f, b) / f.areaM2));
      return {
        surface: f.name,
        delayMs: round(((r - direct) / SPEED_OF_SOUND) * 1000, 2),
        gain: round(((1 - alpha) * direct) / r),
      };
    })
    .sort((a, b) => a.delayMs - b.delayMs);
}

export function roomAcoustics(spec: SceneSpec): Acoustics | null {
  if (!spec.objects.some((p) => p.role === "wall")) return null;
  const outer = union(spec.objects.filter(isBoundary).map(primitiveBounds))!;
  const faces = interiorFaces(spec.objects.filter(isBoundary), outer);
  if (!faces) return null;
  const interior = faces.interior;
  const extent = interior.max.map((v, i) => v - interior.min[i]);
  const volume = extent[0] * extent[1] * extent[2];
  const props = spec.objects.filter(
    (p) =>
      !isBoundary(p) &&
      p.position.every((v, i) => v > interior.min[i] && v < interior.max[i]),
  );
  const propArea = props.reduce((sum, p) => sum + primitiveArea(p), 0);
  const surface = faces.list.reduce((s, f) => s + f.areaM2, 0) + propArea;
  const air = volume > AIR_VOLUME;
  const bands = OCTAVE_BANDS.map((hz, b): AcousticBand => {
    const absorption =
      faces.list.reduce((sum, f) => sum + faceAlpha(f, b), 0) +
      props.reduce(
        (sum, p) =>
          sum + primitiveArea(p) * ABSORPTION[p.material ?? "plaster"][b],
        0,
      );
    const meanAlpha = Math.min(0.999, absorption / surface);
    const airTerm = air ? 4 * AIR[hz] * volume : 0;
    const formula: RtFormula = meanAlpha > 0.2 ? "eyring" : "sabine";
    const loss =
      formula === "eyring" ? -surface * Math.log(1 - meanAlpha) : absorption;
    return {
      hz,
      absorption: round(absorption, 2),
      meanAlpha: round(meanAlpha, 4),
      rt60: round((0.161 * volume) / (loss + airTerm)),
      formula,
      air: airTerm > 0,
    };
  });
  const rt = (hz: number) => bands.find((b) => b.hz === hz)!.rt60;
  const rt60Mid = round((rt(500) + rt(1000)) / 2);
  const closed = faces.list.filter((f) => f.covered.size);
  const nearest = Math.min(
    ...closed.map((f) => Math.abs(spec.subject[f.axis] - f.plane)),
  );
  const listener = clampInto(
    spec.listener ?? [spec.subject[0], spec.subject[1], spec.subject[2] + 3],
    interior,
  );
  const formulas = new Set(bands.map((b) => b.formula));
  const preset = ROOM_PRESETS.map((p) => ({
    ...p,
    distanceS: round(Math.abs(p.rt60 - rt60Mid)),
  })).sort((a, b) => a.distanceS - b.distanceS)[0];
  return {
    volumeM3: round(volume, 2),
    surfaceM2: round(surface, 2),
    openingM2: round(
      faces.list.reduce((s, f) => s + f.openingM2, 0),
      2,
    ),
    interior,
    bands,
    formula: formulas.size === 1 ? [...formulas][0] : "mixed",
    rt60Mid,
    brightness: round(Math.min(1.5, Math.max(0, rt(4000) / rt(500)))),
    criticalDistanceM: round(0.057 * Math.sqrt(volume / rt60Mid)),
    preDelayMs: round(((nearest * 2) / SPEED_OF_SOUND) * 1000, 2),
    listener,
    earlyReflections: reflections(faces.list, spec.subject, listener),
    nearestPreset: preset,
  };
}
