/**
 * Teachings: short fixed sentences, each saying what one part of the studio
 * is for, shown while nothing is running (the deck's bar, the idle bubble
 * and setup; docs/teachings.md). Fixed text, no model call, like the install
 * wait's sentences (`./install-messages.ts`). Every teaching states
 * documented behaviour; a new one cites its source in docs/teachings.md.
 */
import { messageHold } from "./install-messages";

/**
 * A studio preset id (`src/studio/presets.ts`), or "studio" for a line about
 * the studio as a whole. `tests/teachings.test.ts` fails if a preset is
 * renamed out from under a teaching.
 */
export type TeachingSurface =
  | "gallery"
  | "camera"
  | "director"
  | "editor"
  | "world"
  | "dual"
  | "scrolls"
  | "tools"
  | "ninja"
  | "studio";

export type Teaching = {
  readonly id: string;
  readonly surface: TeachingSurface;
  readonly text: string;
};

export const TEACHINGS: readonly Teaching[] = [
  {
    id: "scrolls-plan",
    surface: "scrolls",
    text: "Scrolls hold the plan: characters, shots and sound. Choose what travels onward.",
  },
  {
    id: "scrolls-lore",
    surface: "scrolls",
    text: "The scroll remembers what the sword forgets.",
  },
  {
    id: "world-take",
    surface: "world",
    text: "In 3D, build a set and move the camera, then capture the take as guidance.",
  },
  {
    id: "camera-preview",
    surface: "camera",
    text: "The camera move plays in the 3D preview before a single credit is spent.",
  },
  {
    id: "dual-swords",
    surface: "dual",
    text: "Dual Swords puts two sources side by side. Precise frames, and you keep what works.",
  },
  {
    id: "director-template",
    surface: "director",
    text: "Start from a template in the Director, drop in your character, and make it yours.",
  },
  {
    id: "editor-layers",
    surface: "editor",
    text: "The Editor is what Genobi returns, in layers: change one layer and keep the rest.",
  },
  {
    id: "tools-arena",
    surface: "tools",
    text: "Arena in Project Tools puts two to four results side by side, so you can review the models.",
  },
  {
    id: "ninja-layout",
    surface: "ninja",
    text: "Ninja is your own layout. Keep only the tools you need.",
  },
  {
    id: "studio-voice",
    surface: "studio",
    text: "Press the mic and say what you want. Your agent works the same tools you do.",
  },
  {
    id: "studio-quote",
    surface: "studio",
    text: "Anything that costs money is quoted first and waits for your approval.",
  },
  {
    id: "studio-deck",
    surface: "studio",
    text: "Open the deck and click a blob. Ten points, and it splits in two.",
  },
];

/**
 * The teaching to show next, and the seen list to keep. Each pick is drawn at
 * random from the unseen ones, a shuffle one step at a time, so every
 * teaching shows once before any repeats. Once all have been seen a fresh
 * cycle starts, whose first pick is never the teaching just shown. Ids no
 * longer in the list are dropped. `random` returns [0, 1), as Math.random
 * does; tests pass a seeded one.
 */
export function nextTeaching(
  seen: readonly string[],
  random: () => number = Math.random,
): { teaching: Teaching; seen: string[] } {
  const known = seen.filter((id) => TEACHINGS.some((t) => t.id === id));
  let pool = TEACHINGS.filter((t) => !known.includes(t.id));
  let kept = known;
  if (!pool.length) {
    const last = known.at(-1);
    pool = TEACHINGS.filter((t) => t.id !== last);
    if (!pool.length) pool = [...TEACHINGS];
    kept = [];
  }
  const index = Math.min(
    pool.length - 1,
    Math.max(0, Math.floor(random() * pool.length)),
  );
  const teaching = pool[index];
  return { teaching, seen: [...kept, teaching.id] };
}

/** Milliseconds a teaching stays: the install wait's reading pace. */
export const teachingHold = messageHold;

/**
 * The teaching as the deck's bar says it: the bar's uppercase prefix, then
 * the sentence in its own case, which the pixel font reads better than caps
 * at the bar's size (docs/teachings.md).
 */
export function teachingLine(teaching: Teaching): string {
  return `TEACHING · ${teaching.text}`;
}
