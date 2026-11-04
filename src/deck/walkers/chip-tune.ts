/**
 * The walkers game's music and sound effects as plain data, composed for
 * Genobi: an eight-bar loop in C major (I–vi–IV–V twice) for a 25% pulse
 * lead, a 12.5% pulse counter-line, a triangle bass and a noise kit, plus
 * short effects. The engine in `chip-audio.ts` turns these into oscillators.
 *
 * A bar is eight eighth-note steps written as tokens: a note name (`C5`,
 * `F#4`), `-` to hold the previous note, `.` for a rest. Noise steps are
 * `k` (kick-ish thump), `s` (snare hiss), `h` (hat tick) or `.`.
 */
export type Channel = "lead" | "harmony" | "bass" | "noise";
export type Duty = 0.125 | 0.25 | 0.5;

export const TEMPO = 132;
export const STEPS_PER_BAR = 8;
/** Seconds per eighth-note step. */
export const STEP_SECONDS = 60 / TEMPO / 2;

const LEAD = [
  "E5 - G5 - C6 - B5 G5",
  "A5 - E5 - A5 C6 B5 A5",
  "F5 - A5 - C6 - A5 F5",
  "G5 - B5 D6 - B5 G5 -",
  "E5 G5 C6 - E6 - D6 C6",
  "C6 - A5 - E5 - A5 B5",
  "C6 - A5 F5 G5 - A5 -",
  "G5 - - . D5 E5 F5 G5",
];
const HARMONY = [
  "C5 - - - E5 - - -",
  "C5 - - - E5 - - -",
  "A4 - - - C5 - - -",
  "B4 - - - D5 - - -",
  "G4 - C5 - G4 - C5 -",
  "E4 - A4 - E4 - A4 -",
  "F4 - A4 - F4 - A4 -",
  "D5 - B4 - G4 - B4 -",
];
const BASS = [
  "C3 . C4 . C3 . G3 .",
  "A2 . A3 . A2 . E3 .",
  "F2 . F3 . F2 . C3 .",
  "G2 . G3 . G2 B2 D3 .",
  "C3 . C4 . C3 . G3 .",
  "A2 . A3 . A2 . E3 .",
  "F2 . F3 . F2 . A2 .",
  "G2 . D3 . G2 . G2 B2",
];
const KIT = [
  "k . h . s . h h",
  "k . h . s . h .",
  "k . h . s . h h",
  "k . h k s . h s",
  "k . h . s . h h",
  "k . h . s . h .",
  "k . h . s . h h",
  "k . k . s s s s",
];

export const BARS = LEAD.length;
export const LOOP_STEPS = BARS * STEPS_PER_BAR;

const NAMES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** MIDI number for a note name such as `C4` (60) or `F#5`. */
export function midi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Not a note: ${name}`);
  const shift = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + shift;
}
export const hertz = (note: number) => 440 * 2 ** ((note - 69) / 12);

export interface NoteEvent {
  channel: Channel;
  /** MIDI note for pitched channels; for noise, the hit's playback rate. */
  note: number;
  /** Length in steps. */
  steps: number;
  /** 0..1 loudness before the channel and master gains. */
  level: number;
  hit?: "k" | "s" | "h";
}

function parse(channel: Channel, bars: string[]): NoteEvent[][] {
  const tokens = bars.flatMap((bar) => bar.trim().split(/\s+/));
  if (tokens.length !== LOOP_STEPS)
    throw new Error(`${channel} has ${tokens.length} steps`);
  const at: NoteEvent[][] = tokens.map(() => []);
  tokens.forEach((token, step) => {
    if (token === "." || token === "-") return;
    let steps = 1;
    while (tokens[step + steps] === "-") steps += 1;
    if (channel === "noise") {
      const hit = token as "k" | "s" | "h";
      at[step].push({
        channel,
        note: hit === "k" ? 0.18 : hit === "s" ? 0.6 : 1,
        steps: hit === "h" ? 0.25 : 0.6,
        level: hit === "h" ? 0.35 : hit === "k" ? 0.9 : 0.6,
        hit,
      });
    } else
      at[step].push({
        channel,
        note: midi(token),
        steps,
        level: channel === "harmony" ? 0.55 : 0.8,
      });
  });
  return at;
}

const SONG: NoteEvent[][] = (() => {
  const parts = [
    parse("lead", LEAD),
    parse("harmony", HARMONY),
    parse("bass", BASS),
    parse("noise", KIT),
  ];
  return Array.from({ length: LOOP_STEPS }, (_, i) =>
    parts.flatMap((p) => p[i]),
  );
})();

/** Notes that start at loop step `step` (any integer; the loop repeats). */
export function songStep(step: number): NoteEvent[] {
  return SONG[((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS];
}

/** A short effect: notes at offsets in seconds on one voice. */
export interface Sfx {
  voice: "pulse" | "noise" | "triangle";
  duty?: Duty;
  notes: { at: number; note: number; length: number; level?: number }[];
}

const seq = (
  voice: Sfx["voice"],
  names: string[],
  length: number,
  duty?: Duty,
): Sfx => ({
  voice,
  duty,
  notes: names.map((n, i) => ({ at: i * length, note: midi(n), length })),
});

export type SfxName =
  | "spawn"
  | "assign"
  | "dig"
  | "build"
  | "splat"
  | "saved"
  | "won"
  | "failed"
  | "clink";

export const SFX: Record<SfxName, Sfx[]> = {
  spawn: [seq("pulse", ["C6", "G6"], 0.035, 0.5)],
  assign: [seq("pulse", ["E7"], 0.025, 0.125)],
  dig: [
    {
      voice: "noise",
      notes: [
        { at: 0, note: 0.35, length: 0.07, level: 0.8 },
        { at: 0.05, note: 0.25, length: 0.05, level: 0.5 },
      ],
    },
  ],
  build: [seq("pulse", ["A5", "E6"], 0.025, 0.25)],
  clink: [seq("pulse", ["B6", "B6"], 0.03, 0.125)],
  splat: [
    seq("pulse", ["G5", "D5", "A4", "E4"], 0.045, 0.5),
    {
      voice: "noise",
      notes: [{ at: 0.18, note: 0.15, length: 0.12, level: 0.9 }],
    },
  ],
  saved: [seq("pulse", ["C5", "E5", "G5", "C6", "E6"], 0.04, 0.25)],
  won: [
    seq(
      "pulse",
      ["C5", "E5", "G5", "C6", "G5", "C6", "E6", "G6", "C7"],
      0.1,
      0.25,
    ),
    seq("triangle", ["C3", "G3", "C4", "E3", "G3", "C4"], 0.15),
  ],
  failed: [
    seq("pulse", ["E5", "D#5", "D5", "C#5", "C5"], 0.16, 0.5),
    seq("triangle", ["A2", "G#2", "G2", "F#2", "F2"], 0.16),
  ],
};
