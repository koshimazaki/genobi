import { readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import { findMixTemplate } from "../shared/templates/catalogue";
import { fruitsSwap } from "../shared/templates/fruits-swap";
import {
  beatFrame,
  checkMix,
  mixFrames,
  mixProject,
} from "../shared/templates/mix";
import validators from "../src/director/generated-validators.mjs";

const mix = fruitsSwap.mix!;
const cut = mix.cut;
const media = () =>
  Object.fromEntries(
    Object.entries(mix.media).map(([id, m]) => [
      id,
      { ...m, sha256: "0".repeat(64) },
    ]),
  );
const validate = (moduleId: string, parameters: unknown) =>
  validators[`module_${TRUSTED_RECIPES[moduleId].file.sha256}`](parameters);
const DIR = "public/media/director-templates/fruits-swap";
/** The owner's loop, measured: 9.0008 s, 101.33 BPM, 15.2 beats. */
const LOOP = 9.0008;

describe("Dance with Fruits, the swap edit", () => {
  it("is a mix template the Director opens", () => {
    expect(findMixTemplate("fruits-swap")).toBe(fruitsSwap);
    expect(fruitsSwap).toMatchObject({ name: "Dance with Fruits", run: "mix" });
    expect(fruitsSwap.tier).toBe("open");
  });

  it("cuts three loops on a 100 BPM grid, end card inside the track", () => {
    expect(() => checkMix(cut, media())).not.toThrow();
    expect(cut).toMatchObject({ bpm: 100, fps: 24, width: 1920, height: 1080 });
    // 15 beats a loop: the restarts land on whole beats, 9.0 s and 18.0 s.
    expect(beatFrame(cut, 15) / cut.fps).toBe(9);
    expect(beatFrame(cut, 30) / cut.fps).toBe(18);
    expect(mixFrames(cut)).toBe(734);
    expect(mixFrames(cut)).toBeLessThanOrEqual(
      Math.round(mix.media["fruits-swap-track"].durationSeconds * cut.fps),
    );
    const project = mixProject(cut, fruitsSwap.name, media(), TRUSTED_RECIPES);
    expect(project.composition.durationFrames).toBe(734);
  });

  it("plays mecha, gorilla, gold ninja on the drop, pink cat", () => {
    expect(cut.shots.map((s) => [s.asset, s.startBeat, s.beats])).toEqual([
      ["fruits-swap-mecha", 0, 13],
      ["fruits-swap-gorilla", 15, 8],
      ["fruits-swap-gold-ninja", 23, 5],
      ["fruits-swap-pink-cat", 30, 13],
    ]);
    // Each slice shows its render at the loop position the track is at, so
    // the dancer stays on the music it was made for (within a frame).
    for (const shot of cut.shots) {
      const at = beatFrame(cut, shot.startBeat) / cut.fps;
      // The distance round the loop: 9.0 s is 0.8 ms before a restart.
      const off = (((at - shot.sourceSeconds) % LOOP) + LOOP) % LOOP;
      expect(Math.min(off, LOOP - off), shot.label).toBeLessThan(1 / cut.fps);
    }
  });

  it("holds the last two beats of a loop with a swap card and the next name", () => {
    const cards = cut.layers.filter((l) => l.card && l.module === "space-hud");
    expect(cards.map((c) => [c.startBeat, c.beats])).toEqual([
      [13, 2],
      [28, 2],
    ]);
    const words = cut.layers.filter((l) => l.module === "kinetic");
    expect(words.map((w) => [w.parameters.text, w.startBeat])).toEqual([
      ["GORILLA", 13],
      ["WATERMELON", 23],
      ["PINK CAT", 28],
    ]);
  });

  it("marks every cut with a slice glitch or a Signal wipe", () => {
    const cuts = [
      ...cut.shots.map((s) => s.startBeat),
      ...cut.layers.filter((l) => l.card).map((l) => l.startBeat),
    ].filter((b) => b > 0);
    for (const beat of new Set(cuts)) {
      const marked = cut.layers.some(
        (l) =>
          (l.module === "slice-glitch" && l.startBeat === beat) ||
          (l.module === "signal-wipe" &&
            l.startBeat < beat &&
            l.startBeat + l.beats > beat),
      );
      expect(marked, `beat ${beat}`).toBe(true);
    }
  });

  it("scans the gorilla loop as a surveillance camera", () => {
    const gorilla = (l: (typeof cut.layers)[number]) =>
      l.startBeat >= 15 && l.startBeat + l.beats <= 23;
    const modules = cut.layers.filter(gorilla).map((l) => l.module);
    for (const m of ["hud", "ui-focus", "scan", "crt"])
      expect(modules).toContain(m);
  });

  it("ends on the house end card, in the house typeface", () => {
    const end = cut.layers.find((l) => l.module === "end-card-still")!;
    expect(end.startBeat).toBe(43);
    expect(end.startBeat + end.beats).toBe(cut.beats);
    expect(end.parameters).toMatchObject({
      eyebrow: "MADE WITH",
      title: "GENOBI",
      subtitle: "DANCE WITH FRUITS",
      still: "/media/director-templates/fruits-swap/fruits-swap-end-card.jpg",
    });
    for (const layer of cut.layers)
      if (typeof layer.parameters.font === "string")
        expect(layer.parameters.font, layer.id).toMatch(/^"IBM Plex Mono"/);
  });

  it("uses only trusted recipes, each layer valid", () => {
    for (const layer of cut.layers) {
      expect(TRUSTED_RECIPES[layer.module], layer.id).toBeDefined();
      expect(validate(layer.module, layer.parameters), layer.id).toBe(true);
    }
  });

  it("keeps the bundled media within the Pages and project limits", () => {
    let total = 0;
    for (const name of readdirSync(DIR)) {
      expect(name).toMatch(/^fruits-swap-[a-z0-9-]+\.(mp4|mp3|jpg)$/);
      const size = statSync(`${DIR}/${name}`).size;
      expect(size, name).toBeLessThan(25 * 1024 * 1024);
      total += size;
    }
    expect(total).toBeLessThan(150 * 1024 * 1024);
    for (const m of Object.values(mix.media))
      expect(statSync(`public${m.url}`).isFile()).toBe(true);
  });
});
