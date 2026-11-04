/**
 * Draws the walkers game as an ASCII `Frame` (one character and two colours
 * per cell), the same format the deck's `AsciiScreen` draws for the
 * visualisers. A creature is `o>` walking right and `<o` walking left: its
 * eye trails behind when that cell is free. Pure: same state, same frame.
 */
import { DEFAULT_COLOUR, PALETTE, type Frame } from "../ascii/programs";
import {
  AIR,
  BRICK,
  DOOR,
  HOME,
  SOIL,
  STEEL,
  WATER,
  cellAt,
  type Walker,
  type WalkersState,
} from "./sim";

export const WALKER_COLOURS = {
  soil: 0x9a7448,
  steel: 0x6d737c,
  brick: 0xe0b064,
  water: 0x72d9eb,
  door: PALETTE.lime,
  home: 0xf27d9c,
  body: PALETTE.readout,
  digger: 0xf0c25a,
  builder: 0x72d9eb,
  blocker: PALETTE.coral,
  target: 0x3c4a1c,
  mark: PALETTE.coral,
} as const;

const TILES: Record<number, [string, number]> = {
  [SOIL]: ["▓", WALKER_COLOURS.soil],
  [STEEL]: ["█", WALKER_COLOURS.steel],
  [BRICK]: ["▄", WALKER_COLOURS.brick],
  [WATER]: ["≈", WALKER_COLOURS.water],
  [HOME]: ["⌂", WALKER_COLOURS.home],
  [DOOR]: ["∩", WALKER_COLOURS.door],
};

export function blankFrame(columns: number, rows: number): Frame {
  const cells = new Uint32Array(columns * rows * 3);
  for (let i = 0; i < cells.length; i += 3) {
    cells[i] = 0x20;
    cells[i + 1] = DEFAULT_COLOUR;
    cells[i + 2] = DEFAULT_COLOUR;
  }
  return { columns, rows, cells };
}

export function putChar(
  f: Frame,
  x: number,
  y: number,
  ch: string,
  fg: number,
  bg?: number,
) {
  if (x < 0 || y < 0 || x >= f.columns || y >= f.rows) return;
  const i = (y * f.columns + x) * 3;
  f.cells[i] = ch.codePointAt(0) ?? 0x20;
  f.cells[i + 1] = fg;
  if (bg !== undefined) f.cells[i + 2] = bg;
}

export function putText(
  f: Frame,
  x: number,
  y: number,
  text: string,
  fg: number,
) {
  [...text].forEach((ch, i) => putChar(f, x + i, y, ch, fg));
}

/** The body glyph and colour for a creature's job and heading. */
export function creatureGlyph(w: Walker, falling: boolean): [string, number] {
  if (w.job === "block") return ["Y", WALKER_COLOURS.blocker];
  if (w.job === "dig") return ["v", WALKER_COLOURS.digger];
  if (falling) return ["o", WALKER_COLOURS.body];
  const body = w.dir === 1 ? ">" : "<";
  return [
    body,
    w.job === "build" ? WALKER_COLOURS.builder : WALKER_COLOURS.body,
  ];
}

/** The playing field: terrain, creatures, and marks where some were lost. */
export function drawField(s: WalkersState, target?: number): Frame {
  const f = blankFrame(s.columns, s.rows);
  for (let y = 0; y < s.rows; y++)
    for (let x = 0; x < s.columns; x++) {
      const code = cellAt(s, x, y);
      if (code === AIR) continue;
      const [ch, fg] = TILES[code];
      putChar(f, x, y, ch, fg);
    }
  for (const w of s.walkers) {
    if (w.fate === "home" || !w.fate) continue;
    if (s.tick - (w.at ?? 0) > 6) continue;
    const y = Math.min(w.y, s.rows - 1);
    putChar(f, w.x, y, w.fate === "drown" ? "°" : "*", WALKER_COLOURS.mark);
  }
  const occupied = new Set(
    s.walkers.filter((w) => !w.fate).map((w) => w.y * s.columns + w.x),
  );
  for (const w of s.walkers) {
    if (w.fate) continue;
    const falling = cellAt(s, w.x, w.y + 1) === AIR && w.job !== "dig";
    const [ch, fg] = creatureGlyph(w, falling);
    const bg = w.id === target ? WALKER_COLOURS.target : undefined;
    const eye = w.x - w.dir;
    if (
      !falling &&
      w.job !== "block" &&
      w.job !== "dig" &&
      cellAt(s, eye, w.y) === AIR &&
      !occupied.has(w.y * s.columns + eye)
    )
      putChar(f, eye, w.y, "o", WALKER_COLOURS.body, bg);
    putChar(f, w.x, w.y, ch, fg, bg);
  }
  return f;
}

/**
 * The between-levels screen: a little parade of creatures hopping home, or
 * a quiet row of empty doors when the level failed. `tick` moves the hop.
 */
export function drawOutcome(
  columns: number,
  rows: number,
  tick: number,
  outcome: {
    won: boolean;
    name: string;
    saved: number;
    total: number;
    last: boolean;
  },
): Frame {
  const f = blankFrame(columns, rows);
  const centre = (y: number, text: string, fg: number) =>
    putText(
      f,
      Math.max(0, Math.floor((columns - [...text].length) / 2)),
      y,
      text,
      fg,
    );
  const floor = rows - 2;
  for (let x = 0; x < columns; x++)
    putChar(f, x, floor + 1, "▓", WALKER_COLOURS.soil);
  if (outcome.won) {
    centre(
      0,
      outcome.last ? "THE WHOLE GARDEN IS HOME" : "HOME SWEET HOME",
      PALETTE.readout,
    );
    centre(
      1,
      `${outcome.name.toUpperCase()} · ${outcome.saved}/${outcome.total}`,
      PALETTE.lime,
    );
    for (let i = 0; i < Math.min(outcome.saved, 9); i++) {
      const x = 3 + i * 4;
      const hop = (tick + i * 2) % 6 < 3 ? 1 : 0;
      const y = floor - hop;
      putChar(f, x, y, "o", WALKER_COLOURS.body);
      putChar(f, x + 1, y, hop ? "^" : ">", WALKER_COLOURS.body);
      if (hop) putChar(f, x + 1, y - 1, "♪", WALKER_COLOURS.home);
    }
    putChar(f, columns - 3, floor, "⌂", WALKER_COLOURS.home);
    centre(
      3,
      outcome.last ? "R TO PLAY AGAIN · ESC TO LEAVE" : "N FOR THE NEXT FIELD",
      PALETTE.lime,
    );
  } else {
    centre(0, "NOT ENOUGH MADE IT", PALETTE.coral);
    centre(
      1,
      `${outcome.name.toUpperCase()} · ${outcome.saved}/${outcome.total}`,
      PALETTE.lime,
    );
    for (let x = 4; x < columns - 4; x += 6)
      putChar(f, x, floor, "∩", WALKER_COLOURS.door);
    const x = 4 + (Math.floor(tick / 3) % Math.max(1, columns - 8));
    putChar(f, x, floor, "<", WALKER_COLOURS.body);
    putChar(f, x + 1, floor, "o", WALKER_COLOURS.body);
    centre(3, "R TO TRY AGAIN", PALETTE.lime);
  }
  return f;
}
