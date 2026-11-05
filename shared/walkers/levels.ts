/**
 * The walkers levels: small handmade fields for the deck's Konami game, each
 * 40 columns by 9 rows so it fits the footer terminal. Written for Genobi.
 *
 *   `#` soil (diggable)   `=` steel   `~` water   `E` the door they leave by
 *   `H` home              ` ` air
 *
 * A level is won when at least `need` of its `total` walkers reach home.
 */
export type Job = "dig" | "build" | "block";
export const JOBS: readonly Job[] = ["dig", "build", "block"];

export interface Level {
  name: string;
  /** One line shown before play: what the level teaches, never the answer. */
  hint: string;
  total: number;
  need: number;
  /** Ticks between two walkers leaving the door. */
  every: number;
  jobs: Record<Job, number>;
  map: readonly string[];
}

export const WALKER_COLUMNS = 40;
export const WALKER_ROWS = 9;

const steel = "=".repeat(WALKER_COLUMNS);

export const LEVELS: readonly Level[] = [
  {
    name: "Turn Around",
    hint: "The pond is cold. Someone has to stand firm.",
    total: 5,
    need: 4,
    every: 7,
    jobs: { dig: 0, build: 0, block: 1 },
    map: [
      steel,
      "=                                      =",
      "=                                      =",
      "=                  E                   =",
      "=                                      =",
      "= H                                    =",
      "=#############################~~~~~~~~~=",
      steel,
      steel,
    ],
  },
  {
    name: "Soft Floor",
    hint: "Home is below. The soil is soft.",
    total: 5,
    need: 4,
    every: 8,
    jobs: { dig: 2, build: 0, block: 0 },
    map: [
      steel,
      "=E                       =             =",
      "=#########################             =",
      "=#########################             =",
      "=                                      =",
      "=                                     H=",
      steel,
      steel,
      steel,
    ],
  },
  {
    name: "Mind the Gap",
    hint: "Three cells of water. A stair climbs before it lands.",
    total: 6,
    need: 4,
    every: 9,
    jobs: { dig: 0, build: 2, block: 1 },
    map: [
      steel,
      "=                                      =",
      "=                                      =",
      "= E                                    =",
      "=                                      =",
      "=                                      =",
      "=                                     H=",
      "=##############~~~#####################=",
      steel,
    ],
  },
  {
    name: "Steel Pocket",
    hint: "Steel will not dig. The pond waits at the far end.",
    total: 6,
    need: 5,
    every: 8,
    jobs: { dig: 2, build: 0, block: 1 },
    map: [
      steel,
      "=  E                                   =",
      "=                                      =",
      "==================#####=               =",
      "==================#####=               =",
      "=                      =               =",
      "=H                     =               =",
      "=======================~~~~~~~~~~~~~~~~=",
      steel,
    ],
  },
  {
    name: "Up and Over",
    hint: "A hill, then a pond. Count your steps.",
    total: 8,
    need: 6,
    every: 8,
    jobs: { dig: 0, build: 3, block: 1 },
    map: [
      steel,
      "=                                      =",
      "= E                                    =",
      "=                                      =",
      "=                                      =",
      "=           ##                         =",
      "=           ##                        H=",
      "=#####################~~~##############=",
      steel,
    ],
  },
];
