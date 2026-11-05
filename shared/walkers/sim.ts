/**
 * The walkers simulation: a fixed-step, deterministic model of little Genobi
 * creatures crossing a level. No clock, no randomness and no DOM: the same
 * level and the same inputs at the same ticks give the same result, so the
 * game replays exactly and the tests can drive it tick by tick.
 *
 * One cell per creature. Each tick a creature falls if nothing holds it up,
 * otherwise does its job or walks: one cell forward, up a one-cell step, or
 * turning at a wall or a blocker. A fall longer than `MAX_FALL` cells ends in
 * a splat; water and the bottom of the field are lost too; home is saved.
 */
import {
  LEVELS,
  type Job,
  type Level,
  WALKER_COLUMNS,
  WALKER_ROWS,
} from "./levels";

export const AIR = 0,
  SOIL = 1,
  STEEL = 2,
  BRICK = 3,
  WATER = 4,
  HOME = 5,
  DOOR = 6;

/** Cells a creature may fall through safely; one more is a splat. */
export const MAX_FALL = 5;
/** Bricks in one stair. */
export const STAIR = 5;
/** Ticks a dig or a brick takes. */
export const WORK_TICKS = 2;

export type Fate = "home" | "splat" | "drown" | "void";

export interface Walker {
  id: number;
  x: number;
  y: number;
  dir: 1 | -1;
  job?: Job;
  /** Cells fallen in the current fall. */
  fall: number;
  /** Ticks into the current dig or brick. */
  work: number;
  /** Bricks laid in the current stair. */
  bricks: number;
  fate?: Fate;
  /** The tick the fate came, for the short splat and splash marks. */
  at?: number;
}

export type WalkerEvent =
  | { type: "spawn"; id: number }
  | { type: "dig"; id: number }
  | { type: "clink"; id: number }
  | { type: "build"; id: number }
  | { type: "home"; id: number }
  | { type: "lost"; id: number; fate: Fate }
  | { type: "won" }
  | { type: "failed" };

export interface WalkersState {
  level: number;
  columns: number;
  rows: number;
  terrain: Uint8Array;
  door: { x: number; y: number };
  walkers: Walker[];
  tick: number;
  spawned: number;
  saved: number;
  lost: number;
  total: number;
  need: number;
  every: number;
  jobs: Record<Job, number>;
  status: "playing" | "won" | "failed";
}

const CODES: Record<string, number> = {
  " ": AIR,
  "#": SOIL,
  "=": STEEL,
  "~": WATER,
  H: HOME,
  E: DOOR,
};

/** A fresh state for `LEVELS[index]` (or any level object, for tests). */
export function createLevel(index: number, level?: Level): WalkersState {
  const def = level ?? LEVELS[index];
  const rows = def.map.length,
    columns = def.map[0]?.length ?? WALKER_COLUMNS;
  const terrain = new Uint8Array(columns * rows);
  let door = { x: 1, y: 1 };
  def.map.forEach((line, y) => {
    for (let x = 0; x < columns; x++) {
      const code = CODES[line[x] ?? " "] ?? AIR;
      terrain[y * columns + x] = code;
      if (code === DOOR) door = { x, y };
    }
  });
  return {
    level: index,
    columns,
    rows: rows || WALKER_ROWS,
    terrain,
    door,
    walkers: [],
    tick: 0,
    spawned: 0,
    saved: 0,
    lost: 0,
    total: def.total,
    need: def.need,
    every: def.every,
    jobs: { ...def.jobs },
    status: "playing",
  };
}

export const cellAt = (s: WalkersState, x: number, y: number) =>
  x < 0 || x >= s.columns || y < 0 || y >= s.rows
    ? x < 0 || x >= s.columns
      ? STEEL
      : AIR
    : s.terrain[y * s.columns + x];

const solid = (code: number) =>
  code === SOIL || code === STEEL || code === BRICK;
const open = (code: number) => !solid(code);

function clone(s: WalkersState): WalkersState {
  return {
    ...s,
    terrain: s.terrain.slice(),
    door: { ...s.door },
    jobs: { ...s.jobs },
    walkers: s.walkers.map((w) => ({ ...w })),
  };
}

/** Creatures still on the field. */
export const active = (s: WalkersState) => s.walkers.filter((w) => !w.fate);

/**
 * Advance one tick. Returns a new state and what happened in it; the input
 * state is never changed.
 */
export function stepWalkers(input: WalkersState): {
  state: WalkersState;
  events: WalkerEvent[];
} {
  if (input.status !== "playing") return { state: input, events: [] };
  const s = clone(input);
  const events: WalkerEvent[] = [];
  s.tick += 1;
  const set = (x: number, y: number, code: number) => {
    if (x >= 0 && x < s.columns && y >= 0 && y < s.rows)
      s.terrain[y * s.columns + x] = code;
  };
  const end = (w: Walker, fate: Fate) => {
    w.fate = fate;
    w.at = s.tick;
    w.job = undefined;
    if (fate === "home") {
      s.saved += 1;
      events.push({ type: "home", id: w.id });
    } else {
      s.lost += 1;
      events.push({ type: "lost", id: w.id, fate });
    }
  };
  const blocked = (self: Walker, x: number, y: number) =>
    s.walkers.some(
      (o) =>
        o !== self && !o.fate && o.job === "block" && o.x === x && o.y === y,
    );
  /** After any move: home, water or the bottom of the field. */
  const settle = (w: Walker) => {
    if (w.y >= s.rows) return end(w, "void");
    const here = cellAt(s, w.x, w.y);
    if (here === WATER) end(w, "drown");
    else if (here === HOME) end(w, "home");
  };

  for (const w of s.walkers) {
    if (w.fate) continue;
    const below = cellAt(s, w.x, w.y + 1);
    if (open(below) && w.job !== "dig") {
      // Nothing holds it up: fall one cell, whatever the job was.
      w.job = undefined;
      w.y += 1;
      w.fall += 1;
      settle(w);
      continue;
    }
    if (w.fall > 0) {
      const fell = w.fall;
      w.fall = 0;
      if (fell > MAX_FALL) {
        end(w, "splat");
        continue;
      }
    }
    if (w.job === "block") continue;
    if (w.job === "dig") {
      if (open(below)) {
        w.job = undefined;
        continue;
      }
      if (below === STEEL) {
        w.job = undefined;
        events.push({ type: "clink", id: w.id });
        continue;
      }
      if (++w.work < WORK_TICKS) continue;
      w.work = 0;
      set(w.x, w.y + 1, AIR);
      w.y += 1;
      events.push({ type: "dig", id: w.id });
      settle(w);
      continue;
    }
    if (w.job === "build") {
      const bx = w.x + w.dir;
      if (
        w.bricks >= STAIR ||
        !open(cellAt(s, bx, w.y)) ||
        !open(cellAt(s, bx, w.y - 1)) ||
        cellAt(s, bx, w.y) === HOME ||
        w.y - 1 < 0
      ) {
        w.job = undefined;
      } else {
        if (++w.work < WORK_TICKS) continue;
        w.work = 0;
        set(bx, w.y, BRICK);
        w.bricks += 1;
        w.x = bx;
        w.y -= 1;
        events.push({ type: "build", id: w.id });
        continue;
      }
    }
    walk(s, w, blocked);
    settle(w);
  }

  if (s.spawned < s.total && (s.tick - 1) % s.every === 0) {
    const id = s.spawned;
    s.spawned += 1;
    s.walkers.push({
      id,
      x: s.door.x,
      y: s.door.y,
      dir: 1,
      fall: 0,
      work: 0,
      bricks: 0,
    });
    events.push({ type: "spawn", id });
  }

  const left = active(s);
  const outOfReach = s.total - s.lost < s.need;
  const done = s.spawned === s.total && left.every((w) => w.job === "block");
  if (s.saved >= s.need && (done || s.saved + s.lost === s.total)) {
    s.status = "won";
    events.push({ type: "won" });
  } else if (outOfReach || done) {
    s.status = "failed";
    events.push({ type: "failed" });
  }
  return { state: s, events };
}

function walk(
  s: WalkersState,
  w: Walker,
  blocked: (self: Walker, x: number, y: number) => boolean,
) {
  const nx = w.x + w.dir;
  const ahead = cellAt(s, nx, w.y);
  if (blocked(w, nx, w.y)) {
    w.dir = w.dir === 1 ? -1 : 1;
    return;
  }
  if (open(ahead)) {
    w.x = nx;
    return;
  }
  // A one-cell step up, when there is room for the head on both sides.
  if (
    w.y - 1 >= 0 &&
    open(cellAt(s, nx, w.y - 1)) &&
    open(cellAt(s, w.x, w.y - 1)) &&
    !blocked(w, nx, w.y - 1)
  ) {
    w.x = nx;
    w.y -= 1;
    return;
  }
  w.dir = w.dir === 1 ? -1 : 1;
}

/**
 * Give creature `id` a job, spending one of that job's count. A falling
 * creature cannot take a job, nor one already working; a blocker given any
 * job is released to walk again, at no cost.
 */
export function assignJob(
  input: WalkersState,
  id: number,
  job: Job,
): { state: WalkersState; ok: boolean } {
  const w = input.walkers.find((c) => c.id === id && !c.fate);
  if (!w || input.status !== "playing") return { state: input, ok: false };
  const s = clone(input);
  const c = s.walkers.find((o) => o.id === id)!;
  if (c.job === "block") {
    c.job = undefined;
    return { state: s, ok: true };
  }
  const falling = open(cellAt(s, c.x, c.y + 1));
  if (falling || c.job || s.jobs[job] <= 0) return { state: input, ok: false };
  s.jobs[job] -= 1;
  c.job = job;
  c.work = 0;
  c.bricks = 0;
  return { state: s, ok: true };
}

/** The creature nearest a cell, within `reach` cells, preferring ones that can take a job. */
export function walkerNear(
  s: WalkersState,
  x: number,
  y: number,
  reach = 2,
): number | undefined {
  let best: Walker | undefined,
    score = Infinity;
  for (const w of active(s)) {
    const d = Math.abs(w.x - x) + Math.abs(w.y - y) * 1.2;
    const busy = w.job && w.job !== "block" ? 0.5 : 0;
    if (d <= reach + 0.5 && d + busy < score) {
      best = w;
      score = d + busy;
    }
  }
  return best?.id;
}

/** Active creatures in reading order of the field: the keyboard's target list. */
export function targetOrder(s: WalkersState): number[] {
  return active(s)
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id)
    .map((w) => w.id);
}
