import { describe, expect, it } from "vitest";
import * as bubble from "../docs/director-bundle/example/graphics/mix-speech-bubble.mjs";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import validators from "../src/director/generated-validators.mjs";
import { HEIGHT, overlay, seekOrders, WIDTH } from "./director-effects-harness";

const base = {
  text: "DANCE WITH FRUITS",
  font: "IBM Plex Mono",
  color: "#0c0e0c",
  fill: "#f6f8f2",
  x: 0.46,
  y: 0.28,
  size: 24,
  direction: "up-left",
  duration: 0.35,
};
const { createLayer } = bubble;
// The layout helper the recipe also exports (modules.d.ts types only
// createLayer).
type Box = { x: number; y: number; w: number; h: number };
const { bubbleLayout } = bubble as unknown as {
  bubbleLayout: (
    frame: {
      width: number;
      height: number;
      x: number;
      y: number;
      size: number;
      direction: string;
    },
    box: { w: number; h: number },
  ) => { box: Box; tip: { x: number; y: number } };
};
const validate = (parameters: unknown) =>
  validators[`module_${TRUSTED_RECIPES["speech-bubble"].file.sha256}`](
    parameters,
  );
const FRAMES = [0, 1, 3, 5, 8, 11, 20, 45, 90];
const scaleOf = (calls: unknown[][]) =>
  calls.find(([k]) => k === "scale")?.[1] as number | undefined;

describe("speech bubble", () => {
  it("is a trusted overlay whose every parameter is required and checked", () => {
    expect(TRUSTED_RECIPES["speech-bubble"]).toMatchObject({
      engine: "animejs",
      mode: "overlay",
    });
    expect(validate(base)).toBe(true);
    for (const key of Object.keys(base)) {
      const { [key as keyof typeof base]: _, ...rest } = base;
      expect(validate(rest), key).toBe(false);
    }
    for (const bad of [
      { font: "Comic Sans" },
      { direction: "left" },
      { x: 1.5 },
      { size: 4 },
      { duration: 0 },
      { color: "black" },
      { text: "" },
      { text: "line\u0007" },
    ])
      expect(validate({ ...base, ...bad }), JSON.stringify(bad)).toBe(false);
  });

  it("draws the same frame however it is reached", async () => {
    const a = await overlay(createLayer, base);
    const { inOrder, scrambled } = await seekOrders(a.frame, FRAMES);
    const b = await overlay(createLayer, base);
    for (const f of FRAMES) {
      expect(scrambled.get(f)).toEqual(inOrder.get(f));
      expect(await b.frame(f)).toEqual(inOrder.get(f));
    }
  });

  it("pops in from nothing with an overshoot, then holds with its words", async () => {
    const { frame } = await overlay(createLayer, base);
    // Frame 0: cleared, nothing drawn.
    expect((await frame(0)).some(([k]) => k === "fillText")).toBe(false);
    const scales: number[] = [];
    for (let f = 1; f <= 30; f++) scales.push(scaleOf(await frame(f)) ?? 0);
    expect(scales[0]).toBeLessThan(0.5);
    expect(Math.max(...scales)).toBeGreaterThan(1.02);
    expect(scales.at(-1)).toBeCloseTo(1, 6);
    const held = await frame(30);
    expect(held).toContainEqual([
      "fillText",
      "DANCE WITH FRUITS",
      expect.any(Number),
      expect.any(Number),
    ]);
    // " / " breaks a line.
    const two = await overlay(createLayer, { ...base, text: "DANCE / WITH" });
    const lines = (await two.frame(30)).filter(([k]) => k === "fillText");
    expect(lines.map(([, t]) => t)).toEqual(["DANCE", "WITH"]);
  });

  it("keeps the bubble in the frame and points its tail at the anchor", () => {
    const box = { w: 300, h: 60 };
    for (const direction of ["up-left", "up-right", "down-left", "down-right"])
      for (const [x, y] of [
        [0, 0],
        [1, 1],
        [0.5, 0.5],
        [0.02, 0.98],
      ]) {
        const l = bubbleLayout(
          { width: WIDTH, height: HEIGHT, x, y, size: 24, direction },
          box,
        );
        expect(l.box.x).toBeGreaterThanOrEqual(0);
        expect(l.box.y).toBeGreaterThanOrEqual(0);
        expect(l.box.x + l.box.w).toBeLessThanOrEqual(WIDTH);
        expect(l.box.y + l.box.h).toBeLessThanOrEqual(HEIGHT);
        // The tip sits within a quarter of a line of the anchor.
        expect(
          Math.hypot(l.tip.x - x * WIDTH, l.tip.y - y * HEIGHT),
        ).toBeLessThan(24 * 0.4);
      }
    const up = bubbleLayout(
      {
        width: WIDTH,
        height: HEIGHT,
        x: 0.5,
        y: 0.8,
        size: 24,
        direction: "up-left",
      },
      box,
    );
    expect(up.box.y + up.box.h).toBeLessThan(0.8 * HEIGHT);
    expect(up.box.x).toBeLessThan(0.5 * WIDTH);
  });
});
