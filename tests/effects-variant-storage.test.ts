import { describe, expect, it, vi } from "vitest";
import { createEffectVariant } from "../shared/effects";
import {
  readVariants,
  storeVariants,
  withVariant,
  EFFECT_VARIANT_LIMIT,
} from "../src/effects/variant-store";

describe("saved effect variants", () => {
  it("round-trips complete editable controls without altering the built-in", () => {
    const variant = createEffectVariant("poster-window", "Quiet red", {
      mix: 0.2,
      accent: "#aa3333",
    });
    let stored = "";
    expect(
      storeVariants([variant], {
        setItem: (_key, value) => {
          stored = value;
        },
      }),
    ).toBe(true);
    const restored = readVariants({ getItem: () => stored });
    expect(restored).toEqual([variant]);
    restored[0].parameters.mix = 0.9;
    expect(variant.parameters.mix).toBe(0.2);
    expect(
      createEffectVariant("poster-window", "Default").parameters.mix,
    ).not.toBe(0.2);
  });

  it("rejects incompatible or executable records while keeping valid variants", () => {
    const variant = createEffectVariant("kinetic-title", "My title", {
      text: "KOSHI",
    });
    const incompatible = { ...variant, moduleHashes: { evil: "a".repeat(64) } };
    const executable = { ...variant, source: "alert(1)" };
    expect(
      readVariants({
        getItem: () => JSON.stringify([incompatible, executable, variant]),
      }),
    ).toEqual([variant]);
  });

  it("falls back to tab state when storage access is blocked", () => {
    const throwing = () => {
      throw new Error("Storage blocked");
    };
    expect(readVariants({ getItem: throwing })).toEqual([]);
    expect(storeVariants([], { setItem: throwing })).toBe(false);
    vi.stubGlobal("localStorage", { getItem: throwing, setItem: throwing });
    try {
      expect(readVariants()).toEqual([]);
      expect(storeVariants([])).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("bounds the collection and replaces only the same named parent", () => {
    const values = Array.from({ length: EFFECT_VARIANT_LIMIT }, (_, i) =>
      createEffectVariant("poster-window", `Look ${i}`),
    );
    const duplicate = createEffectVariant("poster-window", "Look 0", {
      mix: 0.1,
    });
    const next = withVariant(values, duplicate);
    expect(next).toHaveLength(EFFECT_VARIANT_LIMIT);
    expect(next[0].parameters.mix).toBe(0.1);
    const differentParent = createEffectVariant("liquid-mirror", "Look 0");
    const both = withVariant(next, differentParent);
    expect(both.slice(0, 2).map((v) => v.presetId)).toEqual([
      "liquid-mirror",
      "poster-window",
    ]);
    expect(values[0].parameters.mix).not.toBe(0.1);
  });

  it("never parses an oversized or non-list collection", () => {
    expect(readVariants({ getItem: () => "x".repeat(256_001) })).toEqual([]);
    expect(
      readVariants({ getItem: () => JSON.stringify({ parameters: {} }) }),
    ).toEqual([]);
  });
});
