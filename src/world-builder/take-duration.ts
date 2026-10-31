/**
 * A camera move's duration and the take's frame grid. A take is 8k + 1
 * frames at 24 fps, from 9 to 721 frames, so a move lasts 0.375 s to about
 * 30.04 s; `seconds` is rounded to the nearest frame count on that grid.
 */
export const TAKE_FPS = 24;
export const TAKE_FRAMES = { min: 9, max: 721, step: 8 } as const;
export const MOVE_SECONDS = {
  min: TAKE_FRAMES.min / TAKE_FPS,
  max: TAKE_FRAMES.max / TAKE_FPS,
} as const;

/** The 8k + 1 frame count nearest to `seconds` at 24 fps, within 9 to 721. */
export function framesForSeconds(seconds: number) {
  const k = Math.round((seconds * TAKE_FPS - 1) / TAKE_FRAMES.step);
  return Math.min(
    TAKE_FRAMES.max,
    Math.max(TAKE_FRAMES.min, k * TAKE_FRAMES.step + 1),
  );
}

export const takeSeconds = (frames: number) => frames / TAKE_FPS;

type Durations = {
  frames: number;
  seconds: number | null;
  motion?: { stateKeys: { frame: number }[] };
  cameraMotion?: { keys: { frame: number }[] };
};

function retimeKeys<T extends { frame: number }>(
  keys: T[],
  before: number,
  after: number,
) {
  if (keys.length > after)
    throw new Error("The take needs at least one frame per animation key.");
  let last = -1;
  return keys.map((key, index) => {
    const frame = Math.max(
      last + 1,
      Math.min(
        after - keys.length + index,
        Math.round((key.frame * (after - 1)) / (before - 1)),
      ),
    );
    last = frame;
    return { ...key, frame };
  });
}

/**
 * Which length an edit asked for. A caller that changes `frames` but leaves
 * `seconds` as it was asked for frames, so seconds follows them (exactly
 * frames / 24, which maps back to the same frame count); otherwise a
 * non-null `seconds` decides the frames when the recipe is validated.
 */
export function reconcileDuration(previous: Durations, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  let next = input as Partial<Durations>;
  if (
    typeof next.frames === "number" &&
    next.frames !== previous.frames &&
    typeof next.seconds === "number" &&
    next.seconds === previous.seconds
  )
    next = { ...next, seconds: takeSeconds(next.frames) };
  const frames =
    typeof next.seconds === "number"
      ? framesForSeconds(next.seconds)
      : next.frames;
  // Only retime an existing sequence that the caller left unchanged. Imported
  // sequences keep their explicit frames and still fail ordinary validation.
  if (
    previous.motion &&
    next.motion &&
    typeof frames === "number" &&
    Number.isInteger(frames) &&
    frames >= TAKE_FRAMES.min &&
    frames <= TAKE_FRAMES.max &&
    frames !== previous.frames &&
    JSON.stringify(next.motion) === JSON.stringify(previous.motion)
  ) {
    next = {
      ...next,
      motion: {
        ...next.motion,
        stateKeys: retimeKeys(next.motion.stateKeys, previous.frames, frames),
      },
    };
  }
  if (
    previous.cameraMotion &&
    next.cameraMotion &&
    typeof frames === "number" &&
    Number.isInteger(frames) &&
    frames >= TAKE_FRAMES.min &&
    frames <= TAKE_FRAMES.max &&
    frames !== previous.frames &&
    JSON.stringify(next.cameraMotion) === JSON.stringify(previous.cameraMotion)
  ) {
    next = {
      ...next,
      cameraMotion: {
        ...next.cameraMotion,
        keys: retimeKeys(next.cameraMotion.keys, previous.frames, frames),
      },
    };
  }
  return next;
}

/**
 * A typed take length in seconds: the 8k + 1 frame count nearest to it,
 * clamped to 9 to 721 frames, or an error for text that is not a positive
 * number. "30" gives 721 frames (30.04 s), including the endpoint at 30 s.
 */
export function framesForTypedSeconds(text: string) {
  const value = Number(text.trim().replace(/\s*s$/i, ""));
  if (!text.trim() || !Number.isFinite(value) || value <= 0)
    return new Error(
      `Type a length in seconds, ${MOVE_SECONDS.min} to ${MOVE_SECONDS.max.toFixed(2)} (${TAKE_FRAMES.min} to ${TAKE_FRAMES.max} frames at ${TAKE_FPS} fps).`,
    );
  return framesForSeconds(value);
}
