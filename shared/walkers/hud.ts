/**
 * The walkers game's status, written with the studio's own progress lines
 * (`shared/progress-line.ts`), the same helpers the wordmark's loader reads:
 * `SAVED 3/4  75% ⣿⣿⣿⣦⣀`. No second bar renderer.
 *
 * - **Saved** counts against the field's target (`need`), not its total, so
 *   a full bar means the field is won.
 * - **Energy** is what is still in play: creatures out on the field plus
 *   those still to leave the door, out of the field's total. The simulation
 *   has no clock, so time would be a made-up number; this runs down to
 *   zero exactly as the field resolves (blockers stay in play until released).
 */
import { progressLine } from "../progress-line";
import { JOBS, LEVELS } from "./levels";
import { active, type WalkersState } from "./sim";

/** Bar cells in the game's own lines, short enough for the 40-column field. */
export const HUD_CELLS = 5;
/** Bar cells in the studio's activity line, as the media loader uses. */
export const ACTIVITY_CELLS = 4;

export const savedFraction = (s: WalkersState) =>
  s.need > 0 ? Math.min(1, s.saved / s.need) : 1;

/** Creatures still in play: on the field plus still behind the door. */
export const energyLeft = (s: WalkersState) =>
  active(s).length + (s.total - s.spawned);

export function savedLine(s: WalkersState) {
  return progressLine(
    `SAVED ${s.saved}/${s.need}`,
    savedFraction(s),
    undefined,
    HUD_CELLS,
  );
}

export function energyLine(s: WalkersState) {
  const left = energyLeft(s);
  return progressLine(
    `ENERGY ${left}/${s.total}`,
    s.total > 0 ? left / s.total : 0,
    undefined,
    HUD_CELLS,
  );
}

/** Job stocks in the same capitals: `DIG 2 · BUILD 0 · BLOCK 1`. */
export function jobsLine(s: WalkersState) {
  return JOBS.map((j) => `${j.toUpperCase()} ${s.jobs[j]}`).join(" · ");
}

/** The word for where the field stands, when it is not simply in play. */
const STATE = { playing: "", won: " · HOME", failed: " · FAILED" } as const;

/**
 * The studio's activity line while the game is open:
 * `WALKERS · FIELD 2 SOFT FLOOR · SAVED 3/4  75% ⣿⣿⣿⣀`.
 */
export function walkersActivityLine(s: WalkersState, paused = false) {
  const name = LEVELS[s.level]?.name.toUpperCase() ?? "";
  const stage = `WALKERS · FIELD ${s.level + 1} ${name} · SAVED ${s.saved}/${s.need}${STATE[s.status]}${paused ? " · PAUSED" : ""}`;
  return progressLine(stage, savedFraction(s), undefined, ACTIVITY_CELLS);
}
