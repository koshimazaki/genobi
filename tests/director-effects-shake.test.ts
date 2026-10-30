import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createLayer as shake } from "../docs/director-bundle/effects/graphics/fx-shake.mjs";
import { filter } from "./director-effects-harness";

// What the viewer sees through the shake: the shader's sampling, evaluated
// per screen pixel on the CPU over a source with a small centred marker.
// The marker's place on screen is the visible move; a screen pixel that
// samples outside the source is an exposed edge.
const SOURCE = readFileSync(
  "docs/director-bundle/effects/graphics/fx-shake.mjs",
  "utf8",
);
const SAMPLE = "(vUv-.5-offset)/zoom+.5";
/** The source point the shader reads for a screen point (texture units). */
const sample = (u: number, offset: number, zoom: number) =>
  (u - 0.5 - offset) / zoom + 0.5;

async function view(
  [width, height]: [number, number],
  parameters: Record<string, number>,
) {
  const s = await filter(shake, parameters, [width, height]);
  return async (frame: number) => {
    const { offset, zoom } = (await s.frame(frame)) as {
      offset: [number, number];
      zoom: number;
    };
    const sx = (px: number) => sample((px + 0.5) / width, offset[0], zoom);
    // Texture y is up: screen row r is texture v = 1 - (r + .5) / height.
    const sy = (row: number) =>
      1 - sample(1 - (row + 0.5) / height, offset[1], zoom);
    // Corners bound the affine mapping, so they show any exposed edge.
    const edges = [0, width - 1].flatMap((px) =>
      [0, height - 1].map((row) => [sx(px), sy(row)]),
    );
    // The marker: source pixels within 3 of the centre, found on screen.
    const reach = Math.ceil(Number(parameters.amplitude)) + 8;
    let n = 0,
      x = 0,
      y = 0;
    for (let row = height / 2 - reach; row < height / 2 + reach; row++)
      for (let px = width / 2 - reach; px < width / 2 + reach; px++) {
        const fx = sx(px) * width - width / 2,
          fy = sy(row) * height - height / 2;
        if (Math.abs(fx) < 3 && Math.abs(fy) < 3) {
          n++;
          x += px + 0.5 - width / 2;
          y += row + 0.5 - height / 2;
        }
      }
    return { edges, move: [x / n, y / n], marker: n };
  };
}

describe("shake, as the viewer sees it", () => {
  it("evaluates the shader's own sampling", () => {
    expect(SOURCE).toContain(`texture2D(source,${SAMPLE})`);
  });
  it("moves the picture at most its amplitude and never shows an edge", async () => {
    const sizes: [number, number][] = [
      [320, 180],
      [180, 320],
      [640, 360],
      [1920, 1080],
      [64, 64],
    ];
    for (const size of sizes)
      for (const [frequency, seed] of [
        [14, 3],
        [30, 9999],
        [0.5, 0],
      ]) {
        const amplitude = 64;
        const at = await view(size, { amplitude, frequency, seed, decay: 0 });
        const limit = Math.min(amplitude, 0.2 * Math.min(...size));
        let largest = 0;
        for (let f = 0; f < 60; f++) {
          const { edges, move, marker } = await at(f);
          for (const [u, v] of edges) {
            expect(u, `${size} f${f}`).toBeGreaterThanOrEqual(0);
            expect(u, `${size} f${f}`).toBeLessThanOrEqual(1);
            expect(v, `${size} f${f}`).toBeGreaterThanOrEqual(0);
            expect(v, `${size} f${f}`).toBeLessThanOrEqual(1);
          }
          expect(marker, `${size} f${f}`).toBeGreaterThan(0);
          // Within a pixel of the limit: the marker is found on whole pixels.
          for (const m of move)
            expect(Math.abs(m), `${size} f${f}`).toBeLessThanOrEqual(limit + 1);
          largest = Math.max(largest, ...move.map(Math.abs));
        }
        // It does shake: the largest move is a real share of the amplitude.
        expect(largest, `${size}`).toBeGreaterThan(limit * 0.3);
      }
  });
  it("leaves the picture in place at amplitude 0", async () => {
    const at = await view([640, 360], {
      amplitude: 0,
      frequency: 14,
      seed: 3,
      decay: 0,
    });
    for (const f of [0, 15, 59]) expect((await at(f)).move).toEqual([0, 0]);
  });
});
