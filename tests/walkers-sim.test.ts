import { describe, expect, it } from "vitest";
import { frameText } from "../shared/ascii/programs";
import {
  LEVELS,
  WALKER_COLUMNS,
  WALKER_ROWS,
  type Level,
} from "../shared/walkers/levels";
import { drawField, drawOutcome } from "../shared/walkers/render";
import {
  AIR,
  BRICK,
  assignJob,
  cellAt,
  createLevel,
  stepWalkers,
  targetOrder,
  walkerNear,
  type WalkersState,
} from "../shared/walkers/sim";

const level = (map: string[], extra: Partial<Level> = {}): Level => ({
  name: "Test",
  hint: "",
  total: 1,
  need: 1,
  every: 50,
  jobs: { dig: 1, build: 1, block: 1 },
  map,
  ...extra,
});
const run = (s: WalkersState, ticks: number) => {
  const events = [];
  for (let i = 0; i < ticks; i++) {
    const next = stepWalkers(s);
    s = next.state;
    events.push(...next.events);
  }
  return { state: s, events };
};
const one = (s: WalkersState) => s.walkers[0];

describe("the walkers levels", () => {
  it("are 3 to 5 fields of the deck's game grid, each with a door and a home", () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(3);
    expect(LEVELS.length).toBeLessThanOrEqual(5);
    for (const l of LEVELS) {
      expect(l.map, l.name).toHaveLength(WALKER_ROWS);
      for (const row of l.map) expect(row, l.name).toHaveLength(WALKER_COLUMNS);
      expect(l.map.join("").match(/E/g), l.name).toHaveLength(1);
      expect(l.map.join(""), l.name).toContain("H");
      expect(l.need).toBeLessThanOrEqual(l.total);
    }
  });
});

describe("the walkers simulation", () => {
  it("spawns at the door, falls to the floor and walks right", () => {
    let s = createLevel(
      0,
      level(["=====", "=E  =", "=   =", "=   =", "====="]),
    );
    const first = stepWalkers(s);
    expect(first.events).toContainEqual({ type: "spawn", id: 0 });
    s = first.state;
    expect(one(s)).toMatchObject({ x: 1, y: 1 });
    s = run(s, 2).state;
    expect(one(s)).toMatchObject({ x: 1, y: 3, fall: 2 });
    s = run(s, 1).state;
    expect(one(s)).toMatchObject({ x: 2, y: 3, fall: 0 });
  });

  it("turns at walls, steps up one cell but not two", () => {
    let s = createLevel(0, level(["======", "=E   =", "=  # =", "======"]));
    s = run(s, 3).state; // spawn, fall, walk to x=2
    expect(one(s)).toMatchObject({ x: 2, y: 2 });
    s = run(s, 1).state; // the soil step at x=3 is one cell high
    expect(one(s)).toMatchObject({ x: 3, y: 1 });
    s = run(s, 1).state;
    expect(one(s)).toMatchObject({ x: 4, y: 1 });
    s = run(s, 2).state; // off the step, then the wall at x=5: turn
    expect(one(s)).toMatchObject({ x: 4, y: 2, dir: -1 });
    const tall = run(
      createLevel(0, level(["=====", "=E #=", "=  #=", "====="])),
      4,
    ).state;
    expect(one(tall)).toMatchObject({ x: 2, dir: -1 });
  });

  it("is deterministic: the same inputs give the same frames", () => {
    const play = () => {
      let s = createLevel(0);
      const frames: string[] = [];
      for (let t = 0; t < 60; t++) {
        if (t === 6) s = assignJob(s, 0, "block").state;
        s = stepWalkers(s).state;
        frames.push(frameText(drawField(s)));
      }
      return frames;
    };
    expect(play()).toEqual(play());
  });

  it("splats after a long fall and drowns in water", () => {
    const drop = level([
      "=====",
      "=E  =",
      "=## =",
      "=   =",
      "=   =",
      "=   =",
      "=   =",
      "=   =",
      "=   =",
      "=====",
    ]);
    const { state, events } = run(createLevel(0, drop), 14);
    expect(one(state).fate).toBe("splat");
    expect(events).toContainEqual({ type: "lost", id: 0, fate: "splat" });
    expect(state.status).toBe("failed");
    const pond = run(
      createLevel(0, level(["=====", "=E  =", "=#~~=", "====="])),
      4,
    ).state;
    expect(one(pond).fate).toBe("drown");
  });

  it("digs down through soil and stops at steel", () => {
    let s = run(
      createLevel(
        0,
        level(["=====", "=E  =", "=## =", "=## =", "=   =", "====="]),
      ),
      2,
    ).state;
    s = assignJob(s, 0, "dig").state;
    expect(s.jobs.dig).toBe(0);
    const dug = run(s, 4);
    expect(dug.events.filter((e) => e.type === "dig")).toHaveLength(2);
    expect(one(dug.state)).toMatchObject({ x: 2, y: 3 });
    expect(cellAt(dug.state, 2, 2)).toBe(AIR);
    expect(cellAt(dug.state, 2, 3)).toBe(AIR);
    const steel = run(
      createLevel(0, level(["=====", "=E  =", "=====", "====="])),
      2,
    ).state;
    const clink = run(assignJob(steel, 0, "dig").state, 1);
    expect(clink.events).toContainEqual({ type: "clink", id: 0 });
    expect(one(clink.state).job).toBeUndefined();
  });

  it("builds a stair of bricks, climbing one cell per brick", () => {
    let s = run(
      createLevel(
        0,
        level([
          "==========",
          "=        =",
          "=        =",
          "=        =",
          "=E       =",
          "==========",
        ]),
      ),
      1,
    ).state;
    s = assignJob(s, 0, "build").state;
    const built = run(s, 2 * 3);
    expect(built.events.filter((e) => e.type === "build")).toHaveLength(3);
    expect(cellAt(built.state, 2, 4)).toBe(BRICK);
    expect(cellAt(built.state, 3, 3)).toBe(BRICK);
    expect(cellAt(built.state, 4, 2)).toBe(BRICK);
    expect(one(built.state)).toMatchObject({ x: 4, y: 1 });
    // The ceiling stops the stair: the builder walks again.
    const after = run(built.state, 1).state;
    expect(one(after).job).toBeUndefined();
  });

  it("turns others back at a blocker, and releases it at no cost", () => {
    let s = createLevel(
      0,
      level(["========", "=E     =", "========"], { total: 2, every: 3 }),
    );
    s = run(s, 2).state; // creature 0 walks to x=2
    s = assignJob(s, 0, "block").state;
    s = run(s, 3).state; // creature 1 leaves at x=1 and meets the blocker
    expect(s.walkers[1]).toMatchObject({ x: 1, dir: -1 });
    expect(assignJob(s, 1, "block").ok).toBe(false); // none left
    const released = assignJob(s, 0, "dig");
    expect(released.ok).toBe(true);
    expect(released.state.walkers[0].job).toBeUndefined();
    expect(released.state.jobs.dig).toBe(1);
  });

  it("refuses jobs for creatures in the air", () => {
    const s = run(
      createLevel(0, level(["=====", "=E  =", "=   =", "====="])),
      1,
    ).state;
    expect(assignJob(s, 0, "dig").ok).toBe(false);
  });

  it("completes a level when enough creatures reach home", () => {
    const s = createLevel(
      0,
      level(["=======", "=E   H=", "======="], { total: 2, need: 2, every: 2 }),
    );
    const { state, events } = run(s, 12);
    expect(state.saved).toBe(2);
    expect(state.status).toBe("won");
    expect(events.filter((e) => e.type === "home")).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: "won" });
    expect(stepWalkers(state).state).toBe(state); // finished levels stay still
  });

  it("solves every shipped level with its own jobs", () => {
    // Recorded solutions: [tick, creature, job]. Proof each field is fair.
    const plans: [number, number, "dig" | "build" | "block"][][] = [
      [[5, 0, "block"]],
      [[6, 0, "dig"]],
      [
        [14, 0, "build"],
        [18, 1, "block"],
        [32, 1, "block"],
      ],
      [[18, 0, "dig"]],
      [
        [11, 0, "build"],
        [33, 0, "build"],
        [34, 1, "block"],
        [46, 1, "block"],
      ],
    ];
    LEVELS.forEach((_, index) => {
      let s = createLevel(index);
      for (let t = 0; t < 400 && s.status === "playing"; t++) {
        for (const [at, id, job] of plans[index])
          if (at === t) s = assignJob(s, id, job).state;
        s = stepWalkers(s).state;
      }
      expect(`${LEVELS[index].name}: ${s.status} ${s.saved}/${s.total}`).toBe(
        `${LEVELS[index].name}: won ${s.saved}/${s.total}`,
      );
    });
  });

  it("picks the creature near a pointed cell and orders targets", () => {
    const s = run(
      createLevel(
        0,
        level(["========", "=E     =", "========"], { total: 2, every: 3 }),
      ),
      5,
    ).state;
    expect(walkerNear(s, 4, 1)).toBe(0);
    expect(walkerNear(s, 1, 1)).toBe(1);
    expect(walkerNear(s, 7, 0, 1)).toBeUndefined();
    expect(targetOrder(s)).toEqual([1, 0]);
  });

  it("draws creatures as o> and the outcome screens", () => {
    const s = run(
      createLevel(0, level(["=======", "=E    =", "======="])),
      4,
    ).state;
    expect(frameText(drawField(s)).split("\n")[1]).toContain("o>");
    const won = frameText(
      drawOutcome(40, 9, 3, {
        won: true,
        name: "Soft Floor",
        saved: 4,
        total: 5,
        last: false,
      }),
    );
    expect(won).toContain("HOME SWEET HOME");
    expect(won).toContain("SOFT FLOOR · 4/5");
    const failed = frameText(
      drawOutcome(40, 9, 3, {
        won: false,
        name: "x",
        saved: 1,
        total: 5,
        last: false,
      }),
    );
    expect(failed).toContain("NOT ENOUGH MADE IT");
  });
});
