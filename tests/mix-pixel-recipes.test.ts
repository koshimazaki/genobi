import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLayer as boxScan } from "../docs/director-bundle/example/graphics/mix-box-scan.mjs";
import { createLayer as scanLock } from "../docs/director-bundle/example/graphics/mix-scan-lock.mjs";
import { createLayer as spriteShower } from "../docs/director-bundle/example/graphics/mix-sprite-shower.mjs";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import validators from "../src/director/generated-validators.mjs";
import { filter, overlay, seekOrders } from "./director-effects-harness";

// The two recipes Dance with Fruits added (docs/fruits-swap.md): the
// pixel-art fruit shower and the surveillance treatment confined to a box.
const validate = (id: string, parameters: unknown) =>
  validators[`module_${TRUSTED_RECIPES[id].file.sha256}`](parameters);
const FRAMES = [0, 1, 5, 12, 29, 45, 75, 90, 149];
const shower = {
  density: 24,
  speed: 0.8,
  direction: "left",
  size: 5,
  seed: 3,
};
const box = {
  x: 0.3,
  y: 0.04,
  w: 0.4,
  h: 0.92,
  feather: 0.03,
  posterize: 0.6,
  levels: 5,
  wire: 0.45,
  color: "#d5ff70",
  sweep: 1.2,
  trail: 0.35,
};
const rects = (calls: unknown[][]) =>
  calls.filter(([k]) => k === "fillRect").map(([, ...r]) => r as number[]);

describe("sprite shower", () => {
  it("is a trusted overlay whose every parameter is required and checked", () => {
    expect(TRUSTED_RECIPES["sprite-shower"]).toMatchObject({
      engine: "animejs",
      mode: "overlay",
    });
    expect(validate("sprite-shower", shower)).toBe(true);
    for (const key of Object.keys(shower)) {
      const { [key as keyof typeof shower]: _, ...rest } = shower;
      expect(validate("sprite-shower", rest), key).toBe(false);
    }
    for (const bad of [
      { density: 0 },
      { density: 2.5 },
      { speed: -1 },
      { direction: "diagonal" },
      { size: 0 },
      { seed: 10000 },
    ])
      expect(validate("sprite-shower", { ...shower, ...bad })).toBe(false);
  });

  it("draws the same frame however it is reached, and moves", async () => {
    const a = await overlay(spriteShower, shower);
    const { inOrder, scrambled } = await seekOrders(a.frame, FRAMES);
    const b = await overlay(spriteShower, shower);
    for (const f of FRAMES) {
      expect(scrambled.get(f)).toEqual(inOrder.get(f));
      expect(await b.frame(f)).toEqual(inOrder.get(f));
    }
    expect(
      new Set(FRAMES.map((f) => JSON.stringify(inOrder.get(f)))).size,
    ).toBeGreaterThan(1);
  });

  it("keeps its pixels crisp: square, whole and on the sprite's grid", async () => {
    // At 1920 wide, size 5 is 5 px per sprite pixel (10 for the large ones).
    const { frame } = await overlay(spriteShower, shower, [1920, 1080]);
    const drawn = rects(await frame(17));
    expect(drawn.length).toBeGreaterThan(0);
    for (const [x, y, w, h] of drawn) {
      expect(w).toBe(h);
      expect([5, 10]).toContain(w);
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(Math.abs(x % 5)).toBe(0);
      expect(Math.abs(y % 5)).toBe(0);
    }
  });

  it("follows density, seed and direction, and holds still at speed 0", async () => {
    const count = async (p: typeof shower, f = 20) =>
      rects(await (await overlay(spriteShower, p)).frame(f)).length;
    expect(await count({ ...shower, density: 80 })).toBeGreaterThan(
      await count({ ...shower, density: 8 }),
    );
    const at = async (p: typeof shower, f: number) =>
      JSON.stringify(await (await overlay(spriteShower, p)).frame(f));
    expect(await at({ ...shower, seed: 4 }, 20)).not.toBe(await at(shower, 20));
    expect(await at({ ...shower, direction: "up" }, 20)).not.toBe(
      await at(shower, 20),
    );
    const still = { ...shower, speed: 0 };
    // Only the bob moves a sprite at speed 0: travel holds.
    const xs = async (f: number) =>
      rects(await (await overlay(spriteShower, still)).frame(f))
        .map(([x]) => x)
        .sort((m, n) => m - n);
    const [a, b] = [await xs(0), await xs(60)];
    expect(a).toEqual(b);
  });
});

describe("scan lock", () => {
  const lock = {
    color: "#f6f8f2",
    accent: "#ff2bd6",
    text: "GORILLA",
    locked: "GORILLA SALSA / DANCE UNLOCKED",
    x: 0.5,
    y: 0.2,
    bpm: 100,
  };
  const texts = (calls: unknown[][]) =>
    calls.filter(([k]) => k === "fillText").map(([, t]) => t);

  it("is a trusted overlay whose every parameter is required and checked", () => {
    expect(TRUSTED_RECIPES["scan-lock"]).toMatchObject({ mode: "overlay" });
    expect(validate("scan-lock", lock)).toBe(true);
    for (const key of Object.keys(lock)) {
      const { [key as keyof typeof lock]: _, ...rest } = lock;
      expect(validate("scan-lock", rest), key).toBe(false);
    }
    for (const bad of [{ locked: "" }, { accent: "pink" }, { bpm: 10 }])
      expect(validate("scan-lock", { ...lock, ...bad })).toBe(false);
  });

  it("acquires, then flips to the locked lines on the accent plate", async () => {
    const { frame } = await overlay(scanLock, lock);
    // 100 BPM at 30 fps: the lock lands on frame 18.
    const before = await frame(10);
    expect(texts(before)).toContain("ACQUIRING");
    expect(texts(before)).toContain("GORILLA");
    const after = await frame(24);
    expect(texts(after)).not.toContain("ACQUIRING");
    expect(texts(after)).toEqual(
      expect.arrayContaining(["GORILLA SALSA", "DANCE UNLOCKED"]),
    );
    // The plate is filled in the accent once locked.
    const fills = after.filter(
      ([k, key, v]) => k === "set" && key === "fillStyle" && v === "#ff2bd6",
    );
    expect(fills.length).toBeGreaterThan(0);
    const { inOrder, scrambled } = await seekOrders(frame, FRAMES);
    for (const f of FRAMES) expect(scrambled.get(f)).toEqual(inOrder.get(f));
  });
});

describe("box scan", () => {
  it("is a trusted filter whose every parameter is required and checked", () => {
    expect(TRUSTED_RECIPES["box-scan"]).toMatchObject({
      engine: "threejs",
      mode: "filter",
    });
    expect(validate("box-scan", box)).toBe(true);
    for (const key of Object.keys(box)) {
      const { [key as keyof typeof box]: _, ...rest } = box;
      expect(validate("box-scan", rest), key).toBe(false);
    }
    for (const bad of [
      { x: -0.1 },
      { w: 1.5 },
      { feather: 0.5 },
      { levels: 1 },
      { levels: 3.5 },
      { posterize: 2 },
      { color: "lime" },
      { sweep: 0 },
    ])
      expect(validate("box-scan", { ...box, ...bad })).toBe(false);
  });

  it("hands the shader its box and settings, and its time alone", async () => {
    const a = await filter(boxScan, box);
    const u = (await a.frame(30)) as Record<string, unknown>;
    expect(u.box).toEqual([0.3, 0.04, 0.4, 0.92]);
    expect(u).toMatchObject({
      feather: 0.03,
      posterize: 0.6,
      levels: 5,
      wire: 0.45,
      sweep: 1.2,
      trail: 0.35,
    });
    const { inOrder, scrambled } = await seekOrders(a.frame, FRAMES);
    for (const f of FRAMES) expect(scrambled.get(f)).toEqual(inOrder.get(f));
    expect((inOrder.get(45) as { time: number }).time).toBeCloseTo(1.5, 6);
  });

  it("passes the picture through outside the box", () => {
    // The shader mixes the treated colour in by the box mask alone.
    const source = readFileSync(
      "docs/director-bundle/example/graphics/mix-box-scan.mjs",
      "utf8",
    );
    expect(source).toContain("gl_FragColor=vec4(mix(original.rgb,color,mask)");
    expect(source).toMatch(/float mask=smoothstep\(lo\.x-f/);
    // Posterized on brightness alone: the pixel is scaled, its hue kept.
    expect(source).toContain("vec3 quantized=min(original.rgb*(stepped/l)");
  });
});
