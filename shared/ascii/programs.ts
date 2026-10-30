/**
 * Genobi's ASCII programs: one character and two colours per cell, as plain
 * functions of the cell, the time and the grid, after Andreas Gysin's
 * play.core (Apache-2.0), whose programs export `main(coord, context)`. These
 * are written for Genobi, not copied. One frame is a `Uint32Array` of
 * `[codePoint, foreground, background]` per cell, row-major: what Claude
 * Code's `Raster` element takes, and what the studio's mini terminal and a
 * Hermes port draw from. No DOM or Node: the same code runs everywhere.
 */

/** `0x00RRGGBB`, or the terminal's own colour. */
export const DEFAULT_COLOUR = 0x01000000;
/** The studio's tokens: lime accent, its readout, coral, and dark ink. */
export const PALETTE = {
  lime: 0xa8be5c,
  readout: 0xd4e88a,
  coral: 0xea7b7b,
  ink: 0x14180e,
} as const;

export interface Frame {
  columns: number;
  rows: number;
  cells: Uint32Array;
}

export type Program = (
  columns: number,
  rows: number,
  time: number,
  input?: VisualInput,
) => Frame;

const mix = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, t));
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k) <<
    shift;
  return ch(16) | ch(8) | ch(0);
};
const frame = (columns: number, rows: number): Frame => ({
  columns,
  rows,
  cells: new Uint32Array(columns * rows * 3),
});
const put = (
  f: Frame,
  x: number,
  y: number,
  ch: number,
  fg: number,
  bg = DEFAULT_COLOUR,
) => {
  const i = (y * f.columns + x) * 3;
  f.cells[i] = ch;
  f.cells[i + 1] = fg;
  f.cells[i + 2] = bg;
};

/** Braille dot bits by sub-pixel: column 0 or 1, row 0 to 3. */
const DOT = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

/** Local mini-game inputs. Metaballs drift independently of the pointer. */
export interface MetaballSeed {
  id: number;
  born: number;
  radius: number;
  colour: number;
  x?: number;
  y?: number;
}
export interface VisualInput {
  pointer?: { x: number; y: number };
  balls?: MetaballSeed[];
}
export const METABALL_COLOURS = [0xf27d9c, 0x72d9eb, 0xc4df79] as const;
export const defaultMetaballs = (): MetaballSeed[] =>
  Array.from({ length: 6 }, (_, id) => ({
    id,
    born: 0,
    radius: 0.13 + (id % 3) * 0.012,
    colour: id % 3,
  }));
export function metaballTargets(time: number, input: VisualInput = {}) {
  return (input.balls ?? defaultMetaballs()).map((b) => {
    const t = (time - b.born) / 1000;
    const drift = b.x === undefined ? 0.31 : 0.14;
    return {
      ...b,
      color: METABALL_COLOURS[b.colour % 3],
      x: Math.max(
        0.06,
        Math.min(
          0.94,
          (b.x ?? 0.5) +
            drift *
              Math.sin(
                t * (0.7 + b.id * 0.07) + (b.x === undefined ? b.id * 2.1 : 0),
              ),
        ),
      ),
      y: Math.max(
        0.06,
        Math.min(
          0.94,
          (b.y ?? 0.5) +
            drift *
              Math.sin(
                t * (0.6 + b.id * 0.05) + (b.y === undefined ? b.id * 2.3 : 0),
              ),
        ),
      ),
    };
  });
}
export function hitMetaball(
  columns: number,
  rows: number,
  time: number,
  x: number,
  y: number,
  input: VisualInput = {},
) {
  const scale = Math.min(columns, rows * 4);
  return metaballTargets(time, input)
    .map((b) => ({
      id: b.id,
      distance:
        Math.hypot((x - b.x) * columns, (y - b.y) * rows * 4) /
        (b.radius * scale),
    }))
    .filter((b) => b.distance <= 1.2)
    .sort((a, b) => a.distance - b.distance)[0]?.id;
}
export function popMetaball(
  balls: MetaballSeed[],
  id: number,
  time: number,
): MetaballSeed[] {
  const target = metaballTargets(time, { balls }).find((b) => b.id === id);
  if (!target) return balls;
  const remaining = balls.filter((b) => b.id !== id);
  if (target.radius < 0.07 || balls.length >= 14) return remaining;
  const nextId = Math.max(...balls.map((b) => b.id)) + 1;
  return [
    ...remaining,
    ...[-1, 1].map((side, index) => ({
      id: nextId + index,
      born: time,
      radius: target.radius * 0.63,
      colour: target.colour,
      x: Math.max(0.05, Math.min(0.95, target.x + side * 0.05)),
      y: target.y,
    })),
  ];
}

/** Morphing fields mix three hues with smooth light-to-dark shading. */
export const metaballs: Program = (columns, rows, time, input) => {
  const f = frame(columns, rows),
    w = columns * 2,
    h = rows * 4;
  const balls = metaballTargets(time, input);
  const field = (x: number, y: number) =>
    balls.map((b) => {
      const dx = (x - b.x * w) / 2,
        dy = y - b.y * h;
      const radius = Math.min(w / 2, h) * b.radius;
      return {
        color: b.color,
        value: (radius * radius) / (dx * dx + dy * dy + 1e-3),
      };
    });
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < columns; cx++) {
      let bits = 0;
      for (let sx = 0; sx < 2; sx++)
        for (let sy = 0; sy < 4; sy++)
          if (
            field(cx * 2 + sx, cy * 4 + sy).reduce(
              (sum, b) => sum + b.value,
              0,
            ) > 1
          )
            bits |= DOT[sx][sy];
      const values = field(cx * 2 + 1, cy * 4 + 2),
        total = values.reduce((sum, b) => sum + b.value, 0);
      const channel = (shift: number) =>
        Math.round(
          values.reduce(
            (sum, b) => sum + ((b.color >> shift) & 255) * b.value,
            0,
          ) / Math.max(total, 1e-6),
        );
      const color = (channel(16) << 16) | (channel(8) << 8) | channel(0);
      put(
        f,
        cx,
        cy,
        0x2800 + bits,
        mix(PALETTE.ink, color, Math.min(1, 0.35 + total * 0.25)),
      );
    }
  return f;
};

/** Braille rain: falling streaks at their own speeds, heads brightest. */
export const rain: Program = (columns, rows, time) => {
  const f = frame(columns, rows);
  const h = rows * 4;
  for (let cx = 0; cx < columns; cx++)
    for (let sx = 0; sx < 2; sx++) {
      const lane = cx * 2 + sx;
      const seed = Math.sin(lane * 91.7) * 43758.5;
      const speed = 6 + (seed - Math.floor(seed)) * 14;
      const length = 3 + ((lane * 7) % 6);
      const head = ((time / 1000) * speed + (seed % h) + h) % (h + length);
      for (let cy = 0; cy < rows; cy++) {
        const i = (cy * columns + cx) * 3;
        for (let sy = 0; sy < 4; sy++) {
          const d = head - (cy * 4 + sy);
          if (d >= 0 && d < length) {
            f.cells[i] = (f.cells[i] || 0x2800) | DOT[sx][sy];
            f.cells[i + 1] = mix(PALETTE.lime, PALETTE.readout, 1 - d / length);
            f.cells[i + 2] = DEFAULT_COLOUR;
          }
        }
      }
    }
  for (let i = 0; i < f.cells.length; i += 3)
    if (!f.cells[i]) {
      f.cells[i] = 0x2800;
      f.cells[i + 1] = PALETTE.lime;
      f.cells[i + 2] = DEFAULT_COLOUR;
    }
  return f;
};

/**
 * Copper bars: three bands sliding up and down, two pixels per cell with the
 * upper half block, so the bars run at double vertical resolution.
 */
export const copper: Program = (columns, rows, time) => {
  const f = frame(columns, rows);
  const t = time / 1000;
  const colours = [PALETTE.lime, PALETTE.coral, PALETTE.readout];
  const pixel = (y: number) => {
    let colour: number = PALETTE.ink,
      best = 0;
    colours.forEach((c, i) => {
      const centre = rows * (1 + Math.sin(t * 1.6 + i * 2.1));
      const v = 1 - Math.abs(y - centre) / 2.2;
      if (v > best) {
        best = v;
        colour = mix(PALETTE.ink, c, v);
      }
    });
    return colour;
  };
  for (let cy = 0; cy < rows; cy++) {
    const top = pixel(cy * 2),
      bottom = pixel(cy * 2 + 1);
    for (let cx = 0; cx < columns; cx++) put(f, cx, cy, 0x2580, top, bottom);
  }
  return f;
};

const FLAME = [0x20, 0x2591, 0x2592, 0x2593, 0x2588];
/**
 * A flame in the spirit of the Doom fire, computed from the time alone so a
 * frame needs no memory: heat rises from the bottom row and cools with noise.
 */
export const flame: Program = (columns, rows, time) => {
  const f = frame(columns, rows);
  const t = time / 90;
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < columns; cx++) {
      const height = 1 - cy / Math.max(1, rows - 1);
      const n =
        Math.sin(cx * 0.9 + t * 0.7) * 0.5 +
        Math.sin(cx * 0.37 - t * 0.45 + cy) * 0.5;
      const heat = Math.min(1, Math.max(0, 1.15 - height * 1.3 + n * 0.35));
      const level = Math.min(FLAME.length - 1, Math.floor(heat * FLAME.length));
      put(f, cx, cy, FLAME[level], mix(PALETTE.coral, PALETTE.readout, heat));
    }
  return f;
};

/** Hot to cool, for the black hole's disc. */
const DISC = [0xf4f1e6, 0xf6e05e, 0xf5a524, 0xea5a2a, 0xc0362c];
const discColour = (k: number) => {
  const x = Math.min(0.999, Math.max(0, k)) * (DISC.length - 1);
  const i = Math.floor(x);
  return mix(DISC[i], DISC[i + 1], x - i);
};
/** A stable 0–1 hash of a dot and a step, so the dither flickers by step only. */
const hash = (x: number, y: number, step: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + step * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * A black hole in braille: a dark centre ringed by a disc that swirls inward,
 * white-hot at the edge of the hole and cooling to red outward. Dots are
 * dithered by density, so the disc reads as a cloud of sparks.
 */
export const blackhole: Program = (columns, rows, time) => {
  const f = frame(columns, rows);
  const t = time / 1000;
  const w = columns * 2,
    h = rows * 4;
  const cx = w / 2,
    cy = h / 2;
  const scale = Math.min(w / 2, h);
  const hole = 0.22;
  const step = Math.floor(t * 12);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      let bits = 0,
        heat = 1;
      for (let sx = 0; sx < 2; sx++)
        for (let sy = 0; sy < 4; sy++) {
          const px = x * 2 + sx,
            py = y * 4 + sy;
          const dx = (px - cx) / 2 / (scale / 2),
            dy = (py - cy) / scale;
          const r = Math.hypot(dx, dy);
          if (r < hole) continue;
          const swirl = Math.atan2(dy, dx) + 0.9 / r - t * 1.4;
          const arms = 0.55 + 0.45 * Math.sin(swirl * 5 + r * 9);
          const density = Math.max(0, 1.15 - (r - hole) * 1.25) * arms + 0.04;
          if (hash(px, py, step) < density) {
            bits |= DOT[sx][sy];
            heat = Math.min(heat, (r - hole) / 1.2);
          }
        }
      put(f, x, y, 0x2800 + bits, discColour(heat));
    }
  return f;
};

export const PROGRAMS = { metaballs, rain, blackhole } as const;
export type ProgramName = keyof typeof PROGRAMS;

/** A frame as plain lines, for a terminal print or a test. */
export function frameText(f: Frame): string {
  const lines: string[] = [];
  for (let y = 0; y < f.rows; y++) {
    let line = "";
    for (let x = 0; x < f.columns; x++)
      line += String.fromCodePoint(f.cells[(y * f.columns + x) * 3]);
    lines.push(line);
  }
  return lines.join("\n");
}
