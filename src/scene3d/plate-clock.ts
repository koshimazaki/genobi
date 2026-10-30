/**
 * The preview's playback clock as plain state. `origin` is the timestamp at
 * which the plate would have been at t = 0, so every tick reads the latest
 * session: picking a plate during playback starts again from zero instead
 * of the running loop restoring the old plate's progress.
 */
export interface PlateClock {
  /** 0..1 through the plate. */
  t: number;
  playing: boolean;
  /** Milliseconds (performance time) at which t was 0. */
  origin: number;
}

export const idleClock: PlateClock = { t: 0, playing: false, origin: 0 };

const anchor = (t: number, now: number, seconds: number) =>
  now - t * seconds * 1000;

/** A plate was picked: a new session from the start; it plays unless motion is reduced. */
export const pickClock = (now: number, reduced: boolean): PlateClock => ({
  t: 0,
  playing: !reduced,
  origin: now,
});

/** Play from where the clock stands, or from the start once it has finished. */
export function playClock(
  clock: PlateClock,
  now: number,
  seconds: number,
): PlateClock {
  const t = clock.t >= 1 ? 0 : clock.t;
  return { t, playing: true, origin: anchor(t, now, seconds) };
}

export const pauseClock = (clock: PlateClock): PlateClock =>
  clock.playing ? { ...clock, playing: false } : clock;

export const seekClock = (t: number): PlateClock => ({
  t: Math.min(1, Math.max(0, t)),
  playing: false,
  origin: 0,
});

/** Keep the current position when the plate's length changes mid-play. */
export const rescaleClock = (
  clock: PlateClock,
  now: number,
  seconds: number,
): PlateClock =>
  clock.playing ? { ...clock, origin: anchor(clock.t, now, seconds) } : clock;

/** One animation frame: advance a playing clock; stop at the end. */
export function tickClock(
  clock: PlateClock,
  now: number,
  seconds: number,
): PlateClock {
  if (!clock.playing) return clock;
  const t = Math.min(1, Math.max(0, (now - clock.origin) / (seconds * 1000)));
  return { ...clock, t, playing: t < 1 };
}
