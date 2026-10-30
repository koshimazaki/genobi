import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CHARACTER_MODELS,
  NON_CYCLIC_CLIPS,
} from "../shared/scene/character-catalog";
import { defaultRecipe, validateRecipe } from "../src/world-builder/recipe";
import { isOneShotLoop, loopNotes } from "../src/world-builder/loop";

/**
 * The largest bone rotation (degrees) and translation between each clip's
 * first and last keyframe, read straight from a GLB's accessors.
 */
function seams(file: string) {
  const b = readFileSync(file);
  const length = b.readUInt32LE(12);
  const json = JSON.parse(b.toString("utf8", 20, 20 + length));
  const bin = 20 + length + 8;
  const ends = (i: number) => {
    const a = json.accessors[i];
    const view = json.bufferViews[a.bufferView];
    const n = { VEC3: 3, VEC4: 4 }[a.type as string] ?? 1;
    const at = (k: number) =>
      b.readFloatLE(bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + 4 * k);
    const first = Array.from({ length: n }, (_, k) => at(k));
    const last = Array.from({ length: n }, (_, k) => at((a.count - 1) * n + k));
    return [first, last];
  };
  const out = new Map<string, { rotation: number; translation: number }>();
  for (const anim of json.animations) {
    let rotation = 0,
      translation = 0;
    for (const ch of anim.channels) {
      const [f, l] = ends(anim.samplers[ch.sampler].output);
      if (ch.target.path === "rotation") {
        const dot = Math.abs(f.reduce((sum, v, k) => sum + v * l[k], 0));
        rotation = Math.max(
          rotation,
          (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI,
        );
      } else if (ch.target.path === "translation")
        translation = Math.max(
          translation,
          Math.hypot(...f.map((v, k) => v - l[k])),
        );
    }
    out.set(anim.name, { rotation, translation });
  }
  return out;
}

const recipe = (patch: object) =>
  validateRecipe({ ...structuredClone(defaultRecipe), ...patch });

describe("one-shot moves in a seamless loop", () => {
  it("lists exactly the bundled clips whose last pose is not their first", () => {
    for (const [asset, file] of [
      ["mannequin", "public/world-assets/AnimationLibrary.glb"],
      ["pug", "public/world-assets/Pug.glb"],
    ] as const) {
      const measured = seams(file);
      for (const clip of Object.values(CHARACTER_MODELS[asset].clips)) {
        const seam = measured.get(clip)!;
        expect(seam, clip).toBeDefined();
        const breaks = seam.rotation > 5 || seam.translation > 0.01;
        expect(NON_CYCLIC_CLIPS.has(clip), clip).toBe(breaks);
      }
    }
  });

  it("says a looping fall snaps back, and says nothing of the sort for walk", () => {
    const fall = recipe({ loop: true, avatar: true, avatarMotion: "fall" });
    expect(isOneShotLoop(fall)).toBe(true);
    expect(loopNotes(fall).join(" ")).toMatch(
      /fall is a one-shot move; the pose snaps back at the seam/,
    );
    const walk = recipe({ loop: true, avatar: true, avatarMotion: "walk" });
    expect(isOneShotLoop(walk)).toBe(false);
    expect(loopNotes(walk).join(" ")).not.toMatch(/one-shot/);
    const list = recipe({
      loop: true,
      avatar: true,
      avatarMotion: [{ clip: "fall", seconds: 1 }],
    });
    expect(loopNotes(list).join(" ")).not.toMatch(/one-shot/);
  });
});
