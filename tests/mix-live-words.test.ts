import { describe, expect, it } from "vitest";
import { createLayer as spriteSwarm } from "../docs/director-bundle/example/graphics/mix-sprite-swarm.mjs";
import { createLayer as typewriter } from "../docs/director-bundle/example/graphics/mix-typewriter.mjs";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import validators from "../src/director/generated-validators.mjs";
import { overlay, seekOrders } from "./director-effects-harness";

// Dance with Fruits v7 (docs/fruits-swap-recipes.md): the typed title and
// the shoulder swarm are live recipes, not pixels baked into the clip.
const validate = (id: string, parameters: unknown) =>
  validators[`module_${TRUSTED_RECIPES[id].file.sha256}`](parameters);
const FRAMES = [0, 1, 5, 9, 12, 29, 45, 75, 90, 149];
const typed = {
  text: "DANCE WITH FRUITS",
  font: '"Press Start 2P", monospace',
  color: "#f6f8f2",
  shadow: "#0c0e0c",
  cursorColor: "#ff4dff",
  size: 72,
  x: 0.5,
  y: 0.86,
  bpm: 100,
  chars: 2,
  division: 2,
};
const swarm = {
  x: 0.535,
  y: 0.21,
  radius: 0.172,
  count: 40,
  size: 10,
  bpm: 100,
  bob: 6,
  swirl: 0.5,
  gather: 0.5,
  burst: 1.7,
  seed: 7,
};
const texts = (calls: unknown[][]) =>
  calls.filter(([k]) => k === "fillText").map(([, t]) => t as string);
const rects = (calls: unknown[][]) =>
  calls.filter(([k]) => k === "fillRect").map(([, ...r]) => r as number[]);

describe("typewriter", () => {
  it("is a trusted overlay whose every parameter is required and checked", () => {
    expect(TRUSTED_RECIPES.typewriter).toMatchObject({ mode: "overlay" });
    expect(validate("typewriter", typed)).toBe(true);
    for (const key of Object.keys(typed)) {
      const { [key as keyof typeof typed]: _, ...rest } = typed;
      expect(validate("typewriter", rest), key).toBe(false);
    }
    for (const bad of [
      { division: 5 },
      { chars: 0 },
      { text: "" },
      { font: "x; y" },
      { cursorColor: "pink" },
      { size: 4 },
    ])
      expect(validate("typewriter", { ...typed, ...bad })).toBe(false);
  });

  it("types two characters every eighth note, from the layer's start", async () => {
    // 100 BPM, an eighth is 0.3 s: 9 frames at 30 fps.
    const { frame } = await overlay(typewriter, typed);
    const line = async (f: number) => texts(await frame(f)).at(-1);
    expect(await line(0)).toBe("DA");
    expect(await line(8)).toBe("DA");
    expect(await line(9)).toBe("DANC");
    expect(await line(36)).toBe("DANCE WITH");
    expect(await line(90)).toBe("DANCE WITH FRUITS");
    // Words over their shadow: each line is drawn twice.
    expect(texts(await frame(90))).toEqual([
      "DANCE WITH FRUITS",
      "DANCE WITH FRUITS",
    ]);
  });

  it("keeps the cursor on while typing, then blinks it on the eighth", async () => {
    const { frame } = await overlay(typewriter, typed);
    const cursor = async (f: number) => rects(await frame(f)).length;
    for (const f of [0, 20, 50]) expect(await cursor(f)).toBe(1);
    // Done after 9 steps (frame 81); then on, off, on by the step.
    const blink = [];
    for (const f of [81, 90, 99, 108]) blink.push(await cursor(f));
    expect(blink).toEqual([0, 1, 0, 1]);
    const { inOrder, scrambled } = await seekOrders(frame, FRAMES);
    for (const f of FRAMES) expect(scrambled.get(f)).toEqual(inOrder.get(f));
  });
});

describe("sprite swarm", () => {
  it("is a trusted overlay whose every parameter is required and checked", () => {
    expect(TRUSTED_RECIPES["sprite-swarm"]).toMatchObject({ mode: "overlay" });
    expect(validate("sprite-swarm", swarm)).toBe(true);
    for (const key of Object.keys(swarm)) {
      const { [key as keyof typeof swarm]: _, ...rest } = swarm;
      expect(validate("sprite-swarm", rest), key).toBe(false);
    }
    for (const bad of [{ count: 0 }, { radius: 0.9 }, { seed: -1 }])
      expect(validate("sprite-swarm", { ...swarm, ...bad })).toBe(false);
  });

  it("flies in, holds a disc on its anchor, bursts out, the same however reached", async () => {
    const W = 1920,
      H = 1080;
    const { frame } = await overlay(spriteSwarm, swarm, [W, H]);
    const drawn = async (f: number) => rects(await frame(f));
    // Off frame at the start, gathered by `gather` (15 frames), gone after the burst.
    expect((await drawn(0)).length).toBe(0);
    const held = await drawn(30);
    expect(held.length).toBeGreaterThan(0);
    const [cx, cy, r] = [0.535 * W, 0.21 * H, 0.172 * W];
    for (const [x, y, w] of held) {
      // Every pixel is a whole square within the disc and its sprites.
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(Math.hypot(x - cx, y - cy)).toBeLessThan(r + 12 * w + 2 * w);
    }
    expect((await drawn(90)).length).toBe(0);
    const { inOrder, scrambled } = await seekOrders(frame, FRAMES);
    for (const f of FRAMES) expect(scrambled.get(f)).toEqual(inOrder.get(f));
  });
});
