import type { Recipe } from "./recipe";
import type { AvatarMotion } from "./motion";
import { motionAt } from "./motion";
import {
  CHARACTER_MODELS,
  NON_CYCLIC_CLIPS,
} from "../../shared/scene/character-catalog";

/** Whether a character's single move ends in a different pose from its first. */
export function isOneShotLoop(
  r: Pick<Recipe, "avatarAsset" | "avatarMotion">,
): boolean {
  if (typeof r.avatarMotion !== "string") return false;
  const model =
    CHARACTER_MODELS[r.avatarAsset as keyof typeof CHARACTER_MODELS];
  const clips: Record<string, string> | undefined = model?.clips;
  return NON_CYCLIC_CLIPS.has(clips?.[r.avatarMotion] ?? "");
}

/**
 * Seamless loops. With `recipe.loop` on, the take is one period of a cycle:
 * the period T is the whole take, frames / fps, so frame `frames` (one step
 * past the last frame) would equal frame 0 and a player looping the clip
 * never repeats or skips a frame at the seam. Everything that moves with time
 * is made periodic on that same T.
 */
export const loopPeriod = (r: Pick<Recipe, "frames" | "fps">) =>
  r.frames / r.fps;

/** Whole cycles of a `cycle`-second motion that fit T: the nearest, at least one. */
export const wholeCycles = (period: number, cycle: number) =>
  Math.max(1, Math.round(period / cycle));

/**
 * The camera's progress at a frame. `turn` drives the orbit; `sweep` drives
 * dolly and elevation change. Off, both are the recipe's curve over
 * frames - 1 (the last frame lands on the end). On, the orbit runs linearly
 * over the whole period so constant angular speed carries across the seam,
 * and dolly and elevation go out and come back (a cosine) so they meet too.
 */
export function cameraProgressAt(
  r: Pick<Recipe, "frames" | "cameraCurve" | "loop">,
  frame: number,
) {
  if (r.loop) {
    const turn = Math.max(0, Math.min(frame / r.frames, 1));
    return { turn, sweep: (1 - Math.cos(2 * Math.PI * turn)) / 2 };
  }
  const raw = Math.max(0, Math.min(frame / (r.frames - 1), 1));
  const eased = r.cameraCurve === "easeInOut" ? raw * raw * (3 - 2 * raw) : raw;
  return { turn: eased, sweep: eased };
}

/**
 * Time into a looping clip of length `cycle`, retimed so the clip plays a
 * whole number of cycles over the period. Wraps at T, so `period` maps to 0.
 */
export function loopedClipTime(seconds: number, period: number, cycle: number) {
  const wrapped = ((seconds % period) + period) % period;
  if (!(cycle > 0)) return wrapped;
  return (wrapped * wholeCycles(period, cycle) * cycle) / period;
}

/**
 * A character's clip and time at a frame. Off, as `motionAt`. On, the frame
 * wraps at the take's end; a single clip is retimed to whole cycles of its
 * own length (`cycle(clip)`, in seconds). A list of moves restarts at the
 * seam; it only meets itself if its last pose matches its first.
 */
export function loopedMotionAt(
  r: Pick<Recipe, "frames" | "fps" | "loop"> & { avatarMotion: AvatarMotion },
  frame: number,
  cycle: (clip: string) => number,
) {
  if (!r.loop) return motionAt(r.avatarMotion, frame, r.fps);
  const wrapped = ((frame % r.frames) + r.frames) % r.frames;
  const move = motionAt(r.avatarMotion, wrapped, r.fps);
  if (typeof r.avatarMotion !== "string") return move;
  return {
    ...move,
    time: loopedClipTime(wrapped / r.fps, loopPeriod(r), cycle(move.clip)),
  };
}

const TURN = 2 * Math.PI;

/**
 * A primitive's spin (radians per second) rounded to whole turns over T, at
 * least one turn in its direction; zero stays still.
 */
export function loopedSpin(spin: number, period: number) {
  if (!spin) return 0;
  const turns = Math.max(1, Math.round((Math.abs(spin) * period) / TURN));
  return (Math.sign(spin) * turns * TURN) / period;
}

/**
 * The Neuro sky's speed rounded to whole cycles over T. The shader reads
 * t = 0.5 * u_time and every term of its pattern is sin or cos of (… − t),
 * so it repeats when t advances by 2π: u_time by 4π, one cycle. Zero stays
 * still; otherwise at least one cycle.
 */
export const NEURO_CYCLE = 4 * Math.PI;
export function loopedShaderSpeed(speed: number, period: number) {
  if (!speed) return 0;
  return (wholeCycles(period, NEURO_CYCLE / speed) * NEURO_CYCLE) / period;
}

/** What the loop does to this recipe, in words, for the hint beside the toggle. */
export function loopNotes(r: Recipe): string[] {
  const period = loopPeriod(r);
  const notes = [
    `Period ${period.toFixed(2)} s (${r.frames} frames); the last frame stops one step short of the first, so a looping player never repeats one.`,
  ];
  if (r.orbit % 360)
    notes.push(
      `Orbit ${r.orbit}° is not a whole turn, so the view jumps at the seam; use ±360°.`,
    );
  else if (r.orbit)
    notes.push("Orbit runs at constant speed; the curve is ignored.");
  if (r.dolly || (r.elevationEnd ?? r.elevation) !== r.elevation)
    notes.push("Dolly and elevation change go out and come back.");
  if (r.avatar && r.scene !== "neuro")
    notes.push(
      typeof r.avatarMotion === "string"
        ? "The character's clip is retimed to the nearest whole number of cycles (at least one)."
        : "The character's move list restarts at the seam; it only meets itself if its last pose matches its first.",
    );
  if (r.avatar && r.scene !== "neuro" && isOneShotLoop(r))
    notes.push(
      `${r.avatarMotion} is a one-shot move; the pose snaps back at the seam.`,
    );
  // Spring bones re-simulate from rest at frame 0, so they cannot meet the seam.
  if (r.avatar && r.scene !== "neuro" && r.avatarAsset === "creature")
    notes.push(
      "The Creature's hair, tail and cloth springs start at rest, so they jump at the seam.",
    );
  const spins = r.objects.filter((p) => p.spin);
  if (r.scene !== "neuro" && spins.length)
    notes.push(
      `Spin rounds to whole turns: ${spins
        .map(
          (p) =>
            `${p.id} ${Math.round((Math.abs(loopedSpin(p.spin, period)) * period) / TURN)}`,
        )
        .join(", ")}.`,
    );
  const orbits = r.objects.filter((p) => p.orbit);
  if (r.scene !== "neuro" && orbits.length)
    notes.push(
      `Orbits round to whole turns: ${orbits
        .map(
          (p) =>
            `${p.id} ${Math.round((Math.abs(loopedSpin(p.orbit!, period)) * period) / TURN)}`,
        )
        .join(", ")}.`,
    );
  if (r.scene === "neuro" && r.speed)
    notes.push(
      `The Neuro sky plays ${wholeCycles(period, NEURO_CYCLE / r.speed)} whole cycle(s): speed ${loopedShaderSpeed(r.speed, period).toFixed(2)} instead of ${r.speed}.`,
    );
  if (r.envelope.length || r.bandEnvelopes.low.length)
    notes.push(
      "Audio-driven motion follows the audio as it is and may not meet.",
    );
  if (Object.keys(r.textures).length)
    notes.push("Video textures play as they are and may not meet.");
  return notes;
}
