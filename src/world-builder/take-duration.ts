import type { AvatarKey } from "./avatar-path";

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
  avatarPath?: AvatarKey[];
  avatarMotion?: string | { clip: string; seconds: number }[];
  loop?: boolean;
};

function retimeKeys<T extends { frame: number }>(
  keys: T[],
  before: number,
  after: number,
  firstFrame = 0,
  lastFrame = after - 1,
) {
  if (keys.length > lastFrame - firstFrame + 1)
    throw new Error("The take needs at least one frame per animation key.");
  let last = firstFrame - 1;
  return keys.map((key, index) => {
    const frame = Math.max(
      last + 1,
      Math.min(
        lastFrame + 1 - keys.length + index,
        Math.round((key.frame * (after - 1)) / (before - 1)),
      ),
    );
    last = frame;
    return { ...key, frame };
  });
}

function clipStarts(steps: { seconds: number }[]) {
  let elapsed = 0;
  return steps.map((step) => {
    const frame = Math.round(elapsed * TAKE_FPS);
    elapsed += step.seconds;
    return { frame };
  });
}

function sharedFrameMap(
  keys: { frame: number }[],
  before: number,
  after: number,
) {
  const times = [
    ...new Set([0, before - 1, ...keys.map((key) => key.frame)]),
  ].sort((a, b) => a - b);
  const current = times
    .filter((frame) => frame < before)
    .map((frame) => ({ frame }));
  const future = times
    .filter((frame) => frame >= before)
    .map((frame) => ({ frame }));
  const changed = retimeKeys(current, before, after);
  if (future.length)
    changed.push(
      ...retimeKeys(
        future,
        before,
        after,
        after,
        Math.max(
          after + future.length - 1,
          Math.round((future.at(-1)!.frame * (after - 1)) / (before - 1)),
        ),
      ),
    );
  return new Map(times.map((frame, index) => [frame, changed[index].frame]));
}

function retimeClips(
  steps: { clip: string; seconds: number }[],
  ratio: number,
  loop: boolean,
  frameMap: Map<number, number>,
  frames: number,
) {
  const keys = loop
    ? clipStarts(steps.map((step) => ({ seconds: step.seconds * ratio }))).map(
        (key) => key.frame,
      )
    : clipStarts(steps).map((key) => frameMap.get(key.frame)!);
  // Steps beyond the captured take cannot affect it. Retaining a stretched
  // unreachable step can exceed the per-step duration contract unnecessarily.
  const visible = steps.filter((_, index) => keys[index] < frames);
  return visible.map((step, index) => ({
    ...step,
    // Event boundaries follow the path's sampled endpoints; retain at least one
    // sample for landing/dance even when shrinking to the shortest LTX take.
    seconds:
      index + 1 < visible.length
        ? loop
          ? Math.max(
              1 / TAKE_FPS,
              Math.min(MOVE_SECONDS.max, step.seconds * ratio),
            )
          : (keys[index + 1] - keys[index]) / TAKE_FPS
        : Math.max(
            1 / TAKE_FPS,
            Math.min(MOVE_SECONDS.max, step.seconds * ratio),
          ),
  }));
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
  if (
    typeof frames !== "number" ||
    !Number.isInteger(frames) ||
    frames < TAKE_FRAMES.min ||
    frames > TAKE_FRAMES.max ||
    frames === previous.frames
  )
    return next;
  // Imported/explicitly edited tracks retain their authored timing. Unchanged
  // tracks share one map so rounding collisions cannot split a landing event.
  const unchanged = (a: unknown, b: unknown) =>
    a !== undefined &&
    b !== undefined &&
    JSON.stringify(a) === JSON.stringify(b);
  const sameMotion = unchanged(previous.motion, next.motion),
    sameCamera = unchanged(previous.cameraMotion, next.cameraMotion),
    // A path beyond the old take describes a deliberately cropped longer move.
    // Keep its times and exclude its keys from the shared collision slots.
    samePath =
      previous.avatarPath?.every((key) => key.frame < previous.frames) ===
        true && unchanged(previous.avatarPath, next.avatarPath),
    sameClips =
      Array.isArray(previous.avatarMotion) &&
      Array.isArray(next.avatarMotion) &&
      unchanged(previous.avatarMotion, next.avatarMotion);
  const loop = next.loop === true;
  const frameMap = sharedFrameMap(
    [
      ...(sameMotion ? next.motion!.stateKeys : []),
      ...(sameCamera ? next.cameraMotion!.keys : []),
      ...(samePath ? next.avatarPath! : []),
      ...(sameClips && !loop
        ? clipStarts(next.avatarMotion as { seconds: number }[])
        : []),
    ],
    previous.frames,
    frames,
  );
  const retime = <T extends { frame: number }>(keys: T[]) =>
    keys.map((key) => ({ ...key, frame: frameMap.get(key.frame)! }));
  if (sameMotion) {
    next = {
      ...next,
      motion: {
        ...next.motion!,
        stateKeys: retime(next.motion!.stateKeys),
      },
    };
  }
  if (sameCamera) {
    next = {
      ...next,
      cameraMotion: {
        ...next.cameraMotion!,
        keys: retime(next.cameraMotion!.keys),
      },
    };
  }
  if (samePath)
    next = {
      ...next,
      avatarPath: retime(next.avatarPath!),
    };
  if (Array.isArray(next.avatarMotion) && sameClips)
    next = {
      ...next,
      avatarMotion: retimeClips(
        next.avatarMotion,
        loop ? frames / previous.frames : (frames - 1) / (previous.frames - 1),
        loop,
        frameMap,
        frames,
      ),
    };
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
