/**
 * The loading cues: a short sound when a load starts and another when it is
 * done, so a person who looks away from the header loader still hears it.
 * Every cue is synthesised (`player.ts`), in the walkers game's chip voices
 * (pulse, triangle, LFSR noise) plus a plain sine. No sample files.
 *
 * Each blip starts `at` seconds into the cue and lasts `length` seconds. Tones
 * glide from `from` to `to` hertz; for noise those are playback rates.
 */
export type Voice = "pulse" | "triangle" | "sine" | "noise";

export interface Blip {
  at: number;
  voice: Voice;
  from: number;
  to?: number;
  length: number;
  /** 0 to 1, before the master volume. */
  level: number;
  /** Pulse duty cycle; 0.5 when not given. */
  duty?: number;
}

export interface LoadCue {
  label: string;
  description: string;
  start: Blip[];
  done: Blip[];
}

const tone = (
  at: number,
  voice: Voice,
  from: number,
  length: number,
  level: number,
  extra: Partial<Blip> = {},
): Blip => ({ at, voice, from, length, level, ...extra });

export const LOAD_SOUNDS = {
  chip: {
    label: "Chip",
    description:
      "Two rising pulse blips, then a bright arpeggio: the walkers' voice.",
    start: [
      tone(0, "pulse", 659.25, 0.07, 0.6, { duty: 0.25 }),
      tone(0.08, "pulse", 987.77, 0.1, 0.6, { duty: 0.25 }),
    ],
    done: [
      tone(0, "pulse", 1046.5, 0.07, 0.55, { duty: 0.125 }),
      tone(0.07, "pulse", 1318.51, 0.07, 0.55, { duty: 0.125 }),
      tone(0.14, "pulse", 1567.98, 0.16, 0.55, { duty: 0.125 }),
      tone(0, "triangle", 261.63, 0.3, 0.7),
    ],
  },
  glass: {
    label: "Glass",
    description:
      "A soft sine ping with an overtone; done is two pings a sixth apart.",
    start: [tone(0, "sine", 880, 0.45, 0.7), tone(0, "sine", 2637, 0.18, 0.15)],
    done: [
      tone(0, "sine", 880, 0.3, 0.6),
      tone(0.12, "sine", 1479.98, 0.55, 0.7),
      tone(0.12, "sine", 4440, 0.2, 0.12),
    ],
  },
  sonar: {
    label: "Sonar",
    description:
      "A rising triangle sweep with a noise tick; done is a bloop up an octave.",
    start: [
      tone(0, "triangle", 300, 0.28, 0.8, { to: 900 }),
      tone(0, "noise", 2, 0.03, 0.35),
    ],
    done: [
      tone(0, "sine", 520, 0.12, 0.7, { to: 1040 }),
      tone(0.13, "sine", 1040, 0.25, 0.6),
    ],
  },
  swish: {
    label: "Swish",
    description:
      "A noise swish that rises; done settles on a soft triangle fifth.",
    start: [tone(0, "noise", 0.25, 0.3, 0.6, { to: 1.5 })],
    done: [
      tone(0, "noise", 1.2, 0.12, 0.2, { to: 0.4 }),
      tone(0.06, "triangle", 523.25, 0.4, 0.6),
      tone(0.06, "triangle", 783.99, 0.4, 0.45),
    ],
  },
} as const satisfies Record<string, LoadCue>;

export type LoadSoundName = keyof typeof LOAD_SOUNDS;
export const LOAD_SOUND_NAMES = Object.keys(LOAD_SOUNDS) as LoadSoundName[];

/** How long a cue sounds, in seconds. */
export const cueSeconds = (blips: readonly Blip[]) =>
  Math.max(0, ...blips.map((b) => b.at + b.length));
