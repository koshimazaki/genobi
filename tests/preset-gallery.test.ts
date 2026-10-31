import { describe, expect, it } from "vitest";
import { createEffectVariant, listEffectPresets } from "../shared/effects";
import { builtInPresets } from "../src/world-builder/world-presets";
import {
  filterPresets,
  galleryPresets,
} from "../src/world-builder/preset-gallery-data";

describe("3D preset catalogue", () => {
  it("includes the real scene-motion recipes alongside the registered effects", () => {
    const scenes = builtInPresets();
    const items = galleryPresets(scenes, listEffectPresets(), []);
    const motion = filterPresets(items, "Motion", "");
    expect(motion.length).toBeGreaterThanOrEqual(4);
    expect(
      motion.every(
        (item) => item.kind === "scene" && !!item.scene.recipe.motion,
      ),
    ).toBe(true);
    expect(
      filterPresets(items, "Effects", "").map((item) => item.name),
    ).toEqual([
      "Poster window",
      "Cinematic scan",
      "Kinetic title",
      "Liquid mirror",
    ]);
    expect(filterPresets(items, "All", "")).toHaveLength(scenes.length + 4);
  });

  it("searches names and scene-state summaries without changing the source", () => {
    const scenes = builtInPresets(),
      before = JSON.stringify(scenes);
    const items = galleryPresets(scenes, listEffectPresets(), []);
    const matching = filterPresets(items, "Motion", "  PYRAMID ");
    expect(matching.length).toBeGreaterThan(0);
    expect(filterPresets(items, "Effects", "PYRAMID")).toEqual([]);
    expect(JSON.stringify(scenes)).toBe(before);
  });

  it("keeps saved scene and effect variants distinct and reusable", () => {
    const scene = {
      ...builtInPresets()[0],
      name: "My room",
      source: "saved" as const,
    };
    const variant = createEffectVariant("poster-window", "My poster", {
      mix: 0.2,
    });
    const items = galleryPresets([scene], listEffectPresets(), [variant]);
    const saved = filterPresets(items, "Saved", "");
    expect(saved.map((p) => p.name)).toEqual(["My room", "My poster"]);
    expect(new Set(items.map((p) => p.key)).size).toBe(items.length);
    expect(filterPresets(items, "Effects", "My poster")).toHaveLength(1);
  });
});
