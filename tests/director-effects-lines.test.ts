import { describe, expect, it } from "vitest";
import { createLayer as speedLines } from "../docs/director-bundle/effects/graphics/fx-speed-lines.mjs";
import { overlay } from "./director-effects-harness";

// Every speed line the module draws must reach the picture: a streak drawn
// wholly off the canvas is a line the viewer never sees. Each streak is one
// filled triangle (moveTo, lineTo, lineTo); points along its middle, from
// the wide end to the tip, are inside the triangle, so one of them inside the
// canvas is a part of the streak on screen.
type Point = [number, number];
function streaks(calls: unknown[][]) {
  const out: Point[][] = [];
  for (const [k, ...args] of calls) {
    if (k === "moveTo") out.push([args as Point]);
    else if (k === "lineTo") out.at(-1)!.push(args as Point);
  }
  return out;
}
function onScreen([a, tip, b]: Point[], width: number, height: number) {
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let k = 1; k < 20; k++) {
    const x = mid[0] + ((tip[0] - mid[0]) * k) / 20,
      y = mid[1] + ((tip[1] - mid[1]) * k) / 20;
    if (x > 0 && x < width && y > 0 && y < height) return true;
  }
  return false;
}

describe("speed lines land on the picture", () => {
  const sizes: [number, number][] = [
    [640, 360],
    [360, 640],
    [320, 180],
    [1920, 1080],
    [200, 200],
  ];
  it("puts part of every radial focus line inside the frame", async () => {
    for (const size of sizes)
      for (const seed of [0, 7, 9999])
        for (const [length, thickness] of [
          [0.05, 0.5],
          [0.45, 6],
          [1, 16],
        ]) {
          const s = await overlay(
            speedLines,
            {
              density: 4,
              color: "#ffffff",
              direction: "radial",
              speed: 1,
              thickness,
              length,
              seed,
            },
            size,
          );
          for (let f = 0; f < 150; f += 7) {
            const drawn = streaks(await s.frame(f));
            expect(drawn).toHaveLength(4);
            for (const streak of drawn)
              expect(onScreen(streak, ...size), `${size} f${f}`).toBe(true);
          }
        }
  });
  it("starts each focus line on the frame's edge, not beyond it", async () => {
    const [width, height] = [640, 360];
    const s = await overlay(
      speedLines,
      {
        density: 32,
        color: "#ffffff",
        direction: "radial",
        speed: 1,
        thickness: 4,
        length: 0.3,
        seed: 7,
      },
      [width, height],
    );
    for (const [a, , b] of streaks(await s.frame(12))) {
      const [x, y] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const toEdge = Math.min(x, width - x, y, height - y);
      expect(Math.abs(toEdge)).toBeLessThan(1e-6);
    }
  });
  it("keeps travelling lines crossing the frame", async () => {
    for (const direction of ["left", "right", "up", "down"]) {
      const s = await overlay(speedLines, {
        density: 24,
        color: "#ffffff",
        direction,
        speed: 2,
        thickness: 3,
        length: 0.2,
        seed: 3,
      });
      for (let f = 0; f < 150; f += 11) {
        const drawn = streaks(await s.frame(f));
        expect(drawn).toHaveLength(24);
        // Most lines are on screen at any moment; none is far off it.
        const visible = drawn.filter((d) => onScreen(d, 640, 360)).length;
        expect(visible, `${direction} f${f}`).toBeGreaterThan(12);
      }
    }
  });
});
