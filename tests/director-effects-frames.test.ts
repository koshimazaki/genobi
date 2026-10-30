import { describe, expect, it } from "vitest";
import { createLayer as shake } from "../docs/director-bundle/effects/graphics/fx-shake.mjs";
import { createLayer as grade } from "../docs/director-bundle/effects/graphics/fx-grade.mjs";
import { createLayer as transition } from "../docs/director-bundle/effects/graphics/fx-transition.mjs";
import { createLayer as speedLines } from "../docs/director-bundle/effects/graphics/fx-speed-lines.mjs";
import { createLayer as styledTitle } from "../docs/director-bundle/effects/graphics/fx-title.mjs";
import {
  defaults,
  filter,
  FPS,
  HEIGHT,
  overlay,
  seekOrders,
  WIDTH,
} from "./director-effects-harness";

// Each motion effect is a pure function of the frame: a seek in any order,
// a fresh instance and an exact-frame export all draw the same thing, which
// is what lets the preview and the MP4 agree.
const FRAMES = [0, 1, 7, 12, 29, 45, 75, 76, 90, 119, 149];
const overlays = {
  transition,
  "speed-lines": speedLines,
  "styled-title": styledTitle,
};
const filters = { shake, grade };

describe("motion effects draw the same frame however it is reached", () => {
  for (const [id, create] of Object.entries(overlays))
    it(`${id}: seek order and a fresh instance do not change a frame`, async () => {
      const a = await overlay(create, defaults(id));
      const { inOrder, scrambled } = await seekOrders(a.frame, FRAMES);
      const b = await overlay(create, defaults(id));
      for (const f of FRAMES) {
        expect(scrambled.get(f)).toEqual(inOrder.get(f));
        expect(await b.frame(f)).toEqual(inOrder.get(f));
      }
      // The effect moves: not every sampled frame draws the same.
      expect(
        new Set(FRAMES.map((f) => JSON.stringify(inOrder.get(f)))).size,
      ).toBeGreaterThan(1);
    });
  for (const [id, create] of Object.entries(filters))
    it(`${id}: seek order and a fresh instance do not change a frame`, async () => {
      const a = await filter(create, defaults(id));
      const { inOrder, scrambled } = await seekOrders(a.frame, FRAMES);
      const b = await filter(create, defaults(id));
      for (const f of FRAMES) {
        expect(scrambled.get(f)).toEqual(inOrder.get(f));
        expect(await b.frame(f)).toEqual(inOrder.get(f));
      }
    });
});

describe("shake", () => {
  const offsets = async (parameters = defaults("shake")) => {
    const s = await filter(shake, parameters);
    const out: [number, number][] = [];
    for (let f = 0; f < 90; f++) {
      const { offset } = (await s.frame(f)) as { offset: [number, number] };
      out.push([offset[0] * WIDTH, offset[1] * HEIGHT]);
    }
    return out;
  };
  it("moves with the seed, dies away with decay and holds still at zero", async () => {
    const a = await offsets({ ...defaults("shake"), seed: 1 });
    const b = await offsets({ ...defaults("shake"), seed: 2 });
    expect(a).not.toEqual(b);
    const decayed = await offsets({ ...defaults("shake"), decay: 6 });
    const peak = (o: [number, number][]) =>
      Math.max(...o.map(([x, y]) => Math.hypot(x, y)));
    expect(peak(decayed.slice(60))).toBeLessThan(peak(decayed.slice(0, 10)));
    for (const [x, y] of await offsets({ ...defaults("shake"), amplitude: 0 }))
      expect(Math.hypot(x, y)).toBe(0);
  });
});

describe("transition", () => {
  const fills = (calls: unknown[][]) =>
    calls.filter(([k]) => k === "fillRect").map(([, ...rect]) => rect);
  const at = async (parameters: Record<string, unknown>, seconds: number) => {
    const t = await overlay(transition, {
      ...defaults("transition"),
      ...parameters,
    } as never);
    return fills(await t.frame(seconds * FPS));
  };
  it("opens on the matte and reveals the picture by the end (in)", async () => {
    for (const type of ["crossfade", "wipe", "slice"]) {
      const start = await at({ type, phase: "in", duration: 1 }, 0);
      const area = start.reduce((n, r) => n + Number(r[2]) * Number(r[3]), 0);
      expect(area).toBe(WIDTH * HEIGHT);
      expect(await at({ type, phase: "in", duration: 1 }, 1)).toEqual(
        type === "crossfade" ? [[0, 0, WIDTH, HEIGHT]] : [],
      );
    }
  });
  it("covers the picture and holds the matte (out)", async () => {
    expect(await at({ type: "wipe", phase: "out", duration: 1 }, 0)).toEqual(
      [],
    );
    expect(
      await at({ type: "wipe", phase: "out", direction: "left" }, 2),
    ).toEqual([[0, 0, WIDTH, HEIGHT]]);
    // Half-way through a rightward wipe out, the matte covers the left half.
    const [half] = await at(
      { type: "wipe", phase: "out", direction: "right", duration: 1 },
      0.5,
    );
    expect(half.slice(0, 2)).toEqual([0, 0]);
    expect(Number(half[2])).toBeCloseTo(WIDTH / 2, 6);
  });
  it("cuts on a whole frame and slices into bands", async () => {
    const flash = { type: "cut", phase: "in", duration: 0.06 };
    expect(await at(flash, 1 / FPS)).toEqual([[0, 0, WIDTH, HEIGHT]]);
    expect(await at(flash, 2 / FPS)).toEqual([]);
    const bands = await at(
      { type: "slice", phase: "out", slices: 6, duration: 1 },
      0.5,
    );
    expect(bands.length).toBeGreaterThan(1);
    expect(bands.length).toBeLessThanOrEqual(6);
  });
});

describe("speed lines and the styled title", () => {
  it("draws one streak per line", async () => {
    for (const direction of ["radial", "left", "down"]) {
      const s = await overlay(speedLines, {
        ...defaults("speed-lines"),
        direction,
        density: 24,
      });
      const calls = await s.frame(10);
      expect(calls.filter(([k]) => k === "fill")).toHaveLength(24);
    }
  });
  it("slides the plate and words in, then rests them on the centre", async () => {
    const t = await overlay(styledTitle, {
      ...defaults("styled-title"),
      direction: "up",
      ease: "outBack",
    });
    // A few frames past the slide, so both curves have finished.
    const rest = await t.frame(
      Number(defaults("styled-title").duration) * FPS + 3,
    );
    expect(rest).toContainEqual(["translate", WIDTH / 2, HEIGHT / 2]);
    expect(rest).toContainEqual(["fillText", "GENOBI", 0, 0]);
    const start = await t.frame(0);
    const moved = start.find(([k]) => k === "translate")!;
    expect(moved[2]).toBeGreaterThan(HEIGHT);
  });
});
