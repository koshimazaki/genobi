import { describe, expect, it } from "vitest";
import { defaultRecipe, validateRecipe } from "../src/world-builder/recipe";
import {
  MAX_ROUTES,
  createRoute,
  modOf,
  modsAt,
  propertiesForTarget,
  routeValue,
  targetForSelection,
} from "../src/world-builder/mod-routes";

const two = [
  { ...defaultRecipe.objects[0], id: "kick" },
  { ...defaultRecipe.objects[1], id: "hat" },
];

describe("World Builder audio mod matrix", () => {
  it("migrates the single-route fields to routes that reproduce them", () => {
    const old = validateRecipe({
      objects: two,
      audioBand: "low",
      audioObject: "kick",
      audioTarget: "scale",
      audioGain: 3,
      audioGate: 0.2,
      audioInvert: true,
      bandEnvelopes: { low: [0.1, 0.5], mid: [], high: [] },
    });
    for (const key of ["audioBand", "audioObject", "audioTarget", "audioGain"])
      expect(key in old).toBe(false);
    expect(old.audioRoutes).toEqual([
      expect.objectContaining({
        target: "prop:kick",
        property: "scale",
        source: "low",
        amount: 3,
        threshold: 0.2,
        invert: true,
        lerp: 1,
      }),
      expect.objectContaining({ target: "neuro", property: "scale" }),
    ]);
    // The old gate silences below it, then inverts: (1 − 0.5) × 3.
    expect(modOf(modsAt(old, 0), ["prop:kick"], "scale")).toBe(0);
    expect(modOf(modsAt(old, 1), ["prop:kick"], "scale")).toBe(1.5);
    expect(modOf(modsAt(old, 1), ["prop:hat"], "scale")).toBe(0);
    // Light drove the key light and the shader whatever object was chosen.
    const light = validateRecipe({ objects: two, audioTarget: "light" });
    expect(light.audioRoutes.map((r) => r.target)).toEqual([
      "light:key",
      "neuro",
    ]);
    // A recipe with no audio fields keeps the old default: all primitives' scale.
    expect(validateRecipe({}).audioRoutes[0]).toMatchObject({
      target: "primitives",
      property: "scale",
      source: "level",
      amount: 2,
    });
  });

  it("lets an old-field patch replace the matrix, and round-trips routes", () => {
    const routed = validateRecipe({
      objects: two,
      audioRoutes: [{ target: "prop:hat", property: "spin" }],
    });
    expect(routed.audioRoutes).toEqual([
      createRoute({ id: "route-1", target: "prop:hat", property: "spin" }),
    ]);
    expect(validateRecipe(routed)).toEqual(routed);
    const patched = validateRecipe({ ...routed, audioTarget: "height" });
    expect(patched.audioRoutes).toHaveLength(1);
    // Route 1's object carries over; the old fields have no spin, so the
    // patch's height replaces it.
    expect(patched.audioRoutes[0]).toMatchObject({
      target: "prop:hat",
      property: "height",
    });
  });

  it("validates route bounds, targets and properties", () => {
    const bad = (route: object) => () =>
      validateRecipe({ objects: two, audioRoutes: [route] });
    expect(bad({ amount: 9 })).toThrow("Route amount must be between 0 and 8");
    expect(bad({ threshold: -0.1 })).toThrow("Route threshold");
    expect(bad({ lerp: 0 })).toThrow("Route lerp");
    expect(bad({ source: "sub" })).toThrow("Invalid audio route");
    expect(bad({ target: "prop:gone" })).toThrow("Unknown audio route target");
    expect(bad({ target: "world:castle" })).toThrow("Unknown audio route");
    expect(bad({ target: "light:key", property: "scale" })).toThrow(
      "light:key takes light",
    );
    expect(bad({ target: "avatar", property: "glow" })).toThrow();
    expect(bad({ script: "x" })).toThrow("Invalid audio route");
    expect(() =>
      validateRecipe({
        audioRoutes: [{ id: "a" }, { id: "a" }],
      }),
    ).toThrow("Invalid audio route");
    expect(() =>
      validateRecipe({
        audioRoutes: Array.from({ length: MAX_ROUTES + 1 }, () => ({})),
      }),
    ).toThrow(`at most ${MAX_ROUTES}`);
    expect(() => validateRecipe({ objects: two, audioObject: "gone" })).toThrow(
      "Invalid audio routing",
    );
    expect(() => validateRecipe({ audioGain: 9 })).toThrow(
      "audioGain must be between 0 and 8",
    );
    expect(propertiesForTarget("avatar")).toEqual(["height", "scale", "yaw"]);
    expect(targetForSelection("prop:kick")).toBe("prop:kick");
    expect(targetForSelection("car-a")).toBe("world:car-a");
    expect(targetForSelection("floor")).toBe("");
  });

  it("drives two objects from two bands independently at a frame", () => {
    const r = validateRecipe({
      objects: two,
      bandEnvelopes: { low: [0, 0.9, 0.2], mid: [], high: [0.6, 0.1, 0.8] },
      audioRoutes: [
        {
          target: "prop:kick",
          property: "height",
          source: "low",
          amount: 2,
          threshold: 0,
          lerp: 1,
        },
        {
          target: "prop:hat",
          property: "scale",
          source: "high",
          amount: 0.5,
          threshold: 0.5,
          lerp: 1,
        },
        { target: "world:car-a", property: "spin", source: "low", lerp: 1 },
      ],
    });
    const at1 = modsAt(r, 1),
      at2 = modsAt(r, 2);
    expect(modOf(at1, ["prop:kick"], "height")).toBeCloseTo(1.8);
    expect(modOf(at1, ["prop:hat"], "scale")).toBe(0); // 0.1 is under its gate
    expect(modOf(at2, ["prop:kick"], "height")).toBeCloseTo(0.4);
    expect(modOf(at2, ["prop:hat"], "scale")).toBeCloseTo(0.4);
    expect(modOf(at1, ["prop:kick"], "scale")).toBe(0);
    expect(modOf(at1, ["prop:hat"], "height")).toBe(0);
    // Spin is a rate: its angle is the sum of earlier frames over fps.
    expect(modOf(at2, ["world:car-a"], "spin")).toBeCloseTo((0 + 0.9) / 24);
    // A disabled route contributes nothing.
    const off = validateRecipe({
      ...r,
      audioRoutes: r.audioRoutes.map((x) => ({ ...x, enabled: false })),
    });
    expect(modsAt(off, 1).size).toBe(0);
  });

  it("smooths over the envelope deterministically, whatever frame is drawn first", () => {
    const route = { source: "level", target: "primitives", amount: 1 };
    const make = () =>
      validateRecipe({
        envelope: [1, 1, 0, 0, 1],
        audioRoutes: [{ ...route, threshold: 0, lerp: 0.5 }],
      });
    const a = make(),
      b = make();
    const forward = [0, 1, 2, 3, 4].map((f) =>
      routeValue(a, a.audioRoutes[0], f),
    );
    const backward = [4, 3, 2, 1, 0]
      .map((f) => routeValue(b, b.audioRoutes[0], f))
      .reverse();
    expect(forward).toEqual([0.5, 0.75, 0.375, 0.1875, 0.59375]);
    expect(backward).toEqual(forward);
    // A new envelope recomputes rather than reusing a stale series.
    const c = validateRecipe({ ...a, envelope: [0, 0, 0, 0, 0] });
    expect(routeValue(c, c.audioRoutes[0], 4)).toBe(0);
  });

  it("matches the single route's closed form exactly on every frame", () => {
    // origin/main's audioLevel before the matrix, verbatim.
    const oldLevel = (
      env: number[],
      gate: number,
      invert: boolean,
      gain: number,
      frame: number,
    ) => {
      const level = env[Math.max(0, Math.floor(frame))] ?? 0;
      return level < gate ? 0 : (invert ? 1 - level : level) * gain;
    };
    const envelope = Array.from(
      { length: 241 },
      (_, i) => ((Math.sin(i * 0.37) * 0.5 + 0.5) * ((i * 7919) % 13)) / 13,
    );
    for (const [gain, gate, invert] of [
      [2, 0, false],
      [3.7, 0.21, true],
      [7.3, 0.6, false],
    ] as const) {
      const r = validateRecipe({
        envelope,
        frames: 241,
        audioGain: gain,
        audioGate: gate,
        audioInvert: invert,
      });
      for (let f = 0; f < 241; f++)
        expect(routeValue(r, r.audioRoutes[0], f)).toBe(
          oldLevel(envelope, gate, invert, gain, f),
        );
    }
  });

  it("lets a partial old-field patch change only what it names", () => {
    const migrated = validateRecipe({
      objects: two,
      audioTarget: "light",
      audioGain: 4,
      audioGate: 0.3,
      audioInvert: true,
    });
    const patched = validateRecipe({ ...migrated, audioBand: "low" });
    expect(patched.audioRoutes.map((r) => [r.target, r.property])).toEqual([
      ["light:key", "light"],
      ["neuro", "light"],
    ]);
    for (const route of patched.audioRoutes)
      expect(route).toMatchObject({
        source: "low",
        amount: 4,
        threshold: 0.3,
        invert: true,
      });
    // The chosen object carries over too.
    const kick = validateRecipe({
      objects: two,
      audioObject: "kick",
      audioTarget: "height",
    });
    expect(
      validateRecipe({ ...kick, audioGain: 5 }).audioRoutes[0],
    ).toMatchObject({ target: "prop:kick", property: "height", amount: 5 });
  });

  it("refuses inherited names and mistyped route fields", () => {
    for (const target of [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
    ])
      expect(() => validateRecipe({ audioRoutes: [{ target }] })).toThrow(
        "Unknown audio route target",
      );
    for (const route of [
      { target: 5 },
      { amount: null },
      { enabled: "yes" },
      { lerp: "1" },
      { id: 7 },
    ])
      expect(() => validateRecipe({ audioRoutes: [route] })).toThrow(
        "Invalid audio route.",
      );
  });
});
