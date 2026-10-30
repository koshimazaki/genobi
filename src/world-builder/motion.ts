import type { CharacterPose } from "../../shared/scene/characters";

/** One named clip held for `seconds` of the take. */
export interface MotionStep {
  clip: CharacterPose;
  seconds: number;
}
/**
 * A recipe's character motion: one clip for the whole take (the original
 * form, still valid), or a list of clips with durations played in order.
 */
export type AvatarMotion = CharacterPose | MotionStep[];

export const MAX_MOTION_STEPS = 8;
/** The longest take is 241 frames at 24 fps. */
export const MAX_STEP_SECONDS = 241 / 24;
export const MIN_STEP_SECONDS = 1 / 24;

/**
 * Clips that play once. Inside a list they hold their last frame until the
 * next step, so a fall ends on the floor; a single clip keeps looping as before.
 */
const ONE_SHOT = new Set<string>([
  "interact",
  "punch",
  "spell",
  "jump",
  "land",
  "roll",
  "fall",
  "sit-down",
  "stand-up",
  "kneel",
  "pick-up",
  "hit",
  "sword",
  "backflip",
]);

const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Validate a motion against one character's clips; throws on anything else. */
export function validMotion(value: unknown, clips: object): AvatarMotion {
  const known = (clip: unknown): clip is CharacterPose =>
    typeof clip === "string" && Object.hasOwn(clips, clip);
  if (known(value)) return value;
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_MOTION_STEPS
  )
    throw new Error("Invalid character or motion.");
  return value.map((step) => {
    if (
      !plain(step) ||
      Object.keys(step).some((k) => k !== "clip" && k !== "seconds") ||
      !known(step.clip) ||
      typeof step.seconds !== "number" ||
      !Number.isFinite(step.seconds) ||
      step.seconds < MIN_STEP_SECONDS ||
      step.seconds > MAX_STEP_SECONDS
    )
      throw new Error(
        `Each move is { clip, seconds } with a known clip and ${MIN_STEP_SECONDS.toFixed(3)} to ${MAX_STEP_SECONDS.toFixed(2)} s.`,
      );
    return { clip: step.clip, seconds: step.seconds };
  });
}

/** Every clip a motion names, in order, without repeats. */
export function motionClips(motion: AvatarMotion): CharacterPose[] {
  return typeof motion === "string"
    ? [motion]
    : [...new Set(motion.map((s) => s.clip))];
}

/** The clip a take opens on. */
export const firstClip = (motion: AvatarMotion): CharacterPose =>
  typeof motion === "string" ? motion : motion[0].clip;

/** Step boundaries on the take's frame grid: each step starts on a whole frame. */
export function motionStarts(motion: MotionStep[], fps: number) {
  let total = 0;
  return motion.map((step) => {
    const start = Math.round(total * fps);
    total += step.seconds;
    return start;
  });
}

/**
 * The clip at `frame` and the time into it in seconds. The last step runs on
 * to the end of the take; a step past the take's end is never reached.
 */
export function motionAt(motion: AvatarMotion, frame: number, fps: number) {
  if (typeof motion === "string")
    return { clip: motion, time: frame / fps, hold: false };
  const starts = motionStarts(motion, fps);
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= frame) i++;
  return {
    clip: motion[i].clip,
    time: Math.max(0, frame - starts[i]) / fps,
    hold: ONE_SHOT.has(motion[i].clip),
  };
}

/** Seconds a motion lists, or null for a single clip that fills the take. */
export const motionSeconds = (motion: AvatarMotion) =>
  typeof motion === "string"
    ? null
    : motion.reduce((sum, s) => sum + s.seconds, 0);
