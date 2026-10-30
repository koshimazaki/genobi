// `set-beat-grid`: the composition's tempo, where a downbeat falls and the
// beats in a bar, so an audio analysis report (`genobi_audio_analysis`, whose
// `composition` uses these names) can be applied as one command. Each field
// is optional and held to the bundle schema's bounds, which the studio's beat
// grid fields use too.
import { refuse } from "./layer-commands";
import type { Project } from "./types";

/** The bounds `project.schema.json` sets on each field. */
export const BEAT_GRID_LIMITS = {
  bpm: { min: 20, max: 300, whole: false },
  beatOffsetSeconds: { min: 0, max: 3600, whole: false },
  beatsPerBar: { min: 1, max: 16, whole: true },
} as const;
export type BeatGridField = keyof typeof BEAT_GRID_LIMITS;
export const BEAT_GRID_FIELDS = Object.keys(
  BEAT_GRID_LIMITS,
) as BeatGridField[];
export type BeatGridPatch = Partial<Record<BeatGridField, number>>;

/** The fields of a `set-beat-grid`: at least one, each within its bounds. */
export function readBeatGrid(value: Record<string, unknown>): BeatGridPatch {
  const out: BeatGridPatch = {};
  for (const key of BEAT_GRID_FIELDS) {
    const v = value[key];
    if (v === undefined) continue;
    const { min, max, whole } = BEAT_GRID_LIMITS[key];
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      (whole && !Number.isInteger(v)) ||
      v < min ||
      v > max
    )
      refuse(
        `${key} must be ${whole ? "a whole number" : "a number"} from ${min} to ${max}`,
      );
    out[key] = v as number;
  }
  if (!Object.keys(out).length)
    refuse(`set-beat-grid needs one of ${BEAT_GRID_FIELDS.join(", ")}`);
  return out;
}

/** The project with the fields given set on its composition; others keep theirs. */
export function setBeatGrid(project: Project, grid: BeatGridPatch): Project {
  return { ...project, composition: { ...project.composition, ...grid } };
}
