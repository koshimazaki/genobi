/**
 * A camera move's duration and the take's frame grid. A take is 8k + 1
 * frames at 24 fps, from 9 to 241 frames, so a move lasts 0.375 s to about
 * 10.04 s; `seconds` is rounded to the nearest frame count on that grid.
 */
export const TAKE_FPS = 24;
export const TAKE_FRAMES = { min: 9, max: 241, step: 8 } as const;
export const MOVE_SECONDS = {
  min: TAKE_FRAMES.min / TAKE_FPS,
  max: TAKE_FRAMES.max / TAKE_FPS,
} as const;

/** The 8k + 1 frame count nearest to `seconds` at 24 fps, within 9 to 241. */
export function framesForSeconds(seconds: number) {
  const k = Math.round((seconds * TAKE_FPS - 1) / TAKE_FRAMES.step);
  return Math.min(
    TAKE_FRAMES.max,
    Math.max(TAKE_FRAMES.min, k * TAKE_FRAMES.step + 1),
  );
}

export const takeSeconds = (frames: number) => frames / TAKE_FPS;

type Durations = { frames: number; seconds: number | null };

/**
 * Which length an edit asked for. A caller that changes `frames` but leaves
 * `seconds` as it was asked for frames, so seconds follows them (exactly
 * frames / 24, which maps back to the same frame count); otherwise a
 * non-null `seconds` decides the frames when the recipe is validated.
 */
export function reconcileDuration(previous: Durations, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const next = input as Partial<Durations>;
  if (
    typeof next.frames === "number" &&
    next.frames !== previous.frames &&
    typeof next.seconds === "number" &&
    next.seconds === previous.seconds
  )
    return { ...next, seconds: takeSeconds(next.frames) };
  return input;
}

/**
 * A typed take length in seconds: the 8k + 1 frame count nearest to it,
 * clamped to 9 to 241 frames, or an error for text that is not a positive
 * number. "10" gives 241 frames (10.04 s), so a length can match an audio loop.
 */
export function framesForTypedSeconds(text: string) {
  const value = Number(text.trim().replace(/\s*s$/i, ""));
  if (!text.trim() || !Number.isFinite(value) || value <= 0)
    return new Error(
      `Type a length in seconds, ${MOVE_SECONDS.min} to ${MOVE_SECONDS.max.toFixed(2)} (9 to 241 frames at 24 fps).`,
    );
  return framesForSeconds(value);
}
