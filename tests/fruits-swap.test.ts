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
/** The splash: four beats before loop 1, over the loop's last 2.4 s. */
const S = 4;
const layer = (id: string) => cut.layers.find((l) => l.id === id)!;
const of = (module: string) =>
  cut.layers
    .filter((l) => l.module === module)
    .sort((a, b) => a.startBeat - b.startBeat);

describe("Dance with Fruits, the swap edit", () => {
  it("is a mix template the Director opens", () => {
    expect(findMixTemplate("fruits-swap")).toBe(fruitsSwap);
    expect(fruitsSwap).toMatchObject({ name: "Dance with Fruits", run: "mix" });
    expect(fruitsSwap.tier).toBe("open");
  });

  it("puts a four-beat splash before three loops, restarts on whole beats", () => {
    expect(() => checkMix(cut, media())).not.toThrow();
    expect(cut).toMatchObject({ bpm: 100, fps: 24, width: 1920, height: 1080 });
    // The track opens 2.4 s before a loop restart: 15 beats a loop after it.
    expect(cut.inPointSeconds + (S * 60) / cut.bpm).toBeCloseTo(LOOP, 2);
    for (const [beat, seconds] of [
      [S, 2.4],
      [S + 15, 11.4],
      [S + 30, 20.4],
    ])
      expect(beatFrame(cut, beat) / cut.fps).toBeCloseTo(seconds, 1);
    // 55 beats: 33.0 s, under the owner's 35.
    expect(mixFrames(cut)).toBe(792);
    expect(mixFrames(cut)).toBeLessThanOrEqual(
      Math.round(mix.media["fruits-swap-track"].durationSeconds * cut.fps),
    );
    const project = mixProject(cut, fruitsSwap.name, media(), TRUSTED_RECIPES);
    expect(project.composition.durationFrames).toBe(792);
  });

  it("plays the splash, then mecha, gorilla, gold ninja on the drop, pink cat", () => {
    expect(cut.shots.map((s) => [s.asset, s.startBeat, s.beats])).toEqual([
      ["fruits-swap-splash", 0, S],
      ["fruits-swap-mecha", S, 13],
      ["fruits-swap-gorilla", S + 15, 8],
      ["fruits-swap-gold-ninja", S + 23, 5],
      ["fruits-swap-pink-cat", S + 30, 13],
    ]);
    // Each dance slice shows its render at the loop position the track is
    // at, so the dancer stays on the music it was made for (within a frame).
    for (const shot of cut.shots.slice(1)) {
      const at = beatFrame(cut, shot.startBeat) / cut.fps + cut.inPointSeconds;
      const off = (((at - shot.sourceSeconds) % LOOP) + LOOP) % LOOP;
      expect(Math.min(off, LOOP - off), shot.label).toBeLessThan(1 / cut.fps);
    }
  });

  it("flies pixel fruit across the splash and floods the frame into the end card", () => {
    const [thick, thin, ...flood] = of("sprite-shower");
    // Thick while the apple lands, thin once the words do.
    expect([thick.startBeat, thin.startBeat + thin.beats]).toEqual([0, S]);
    expect(thin.parameters.density).toBeLessThan(
      thick.parameters.density as number,
    );
    expect(flood.map((l) => l.startBeat)).toEqual([S + 41, S + 42.5]);
    // The flood thickens, and its last layer covers the end card's entry.
    expect(flood[1].parameters.density).toBeGreaterThan(
      flood[0].parameters.density as number,
    );
    const end = layer("end-card");
    expect(flood[1].startBeat + flood[1].beats).toBeGreaterThan(end.startBeat);
    // The card comes up built: its dot-matrix construction is skipped.
    expect(end.offsetSeconds).toBeGreaterThan(
      end.parameters.duration as number,
    );
    const project = mixProject(cut, fruitsSwap.name, media(), TRUSTED_RECIPES);
    const card = project.layers.find((l) => l.id === "end-card")!;
    expect(card.animationOffsetFrames).toBe(end.offsetSeconds! * cut.fps);
    // A recipe clock may start late, never before 0 or past a minute.
    for (const offsetSeconds of [-1, 61])
      expect(() =>
        checkMix(
          {
            ...cut,
            layers: cut.layers.map((l) =>
              l.id === "end-card" ? { ...l, offsetSeconds } : l,
            ),
          },
          media(),
        ),
      ).toThrow(/clock/);
  });

  it("holds the last two beats of a loop with a swap card and the next name", () => {
    const cards = of("space-hud");
    expect(cards.map((c) => [c.startBeat, c.beats, c.card])).toEqual([
      [S + 13, 2, true],
      [S + 28, 2, true],
    ]);
    // The names are baked into each card's still (Retro Gaming, never
    // bundled), which is dimmed already, so the card does not dim it again.
    expect(cards.map((c) => [c.parameters.still, c.parameters.dim])).toEqual([
      [`/media/director-templates/fruits-swap/fruits-swap-card-1.jpg`, 0],
      [`/media/director-templates/fruits-swap/fruits-swap-card-2.jpg`, 0],
    ]);
    // Every word is baked: the splash, the typed title, the swap words.
    expect(of("kinetic")).toEqual([]);
    expect(of("speech-bubble")).toEqual([]);
  });

  it("marks every cut with a slice glitch", () => {
    const cuts = [
      ...cut.shots.map((s) => s.startBeat),
      ...cut.layers.filter((l) => l.card).map((l) => l.startBeat),
    ].filter((b) => b > 0);
    for (const beat of new Set(cuts))
      expect(
        of("slice-glitch").some((l) => l.startBeat === beat),
        `beat ${beat}`,
      ).toBe(true);
  });

  it("scans the gorilla as a surveillance camera, its box alone degrading", () => {
    const inLoop = (l: (typeof cut.layers)[number]) =>
      l.startBeat >= S + 15 && l.startBeat + l.beats <= S + 23;
    const modules = cut.layers.filter(inLoop).map((l) => l.module);
    for (const m of ["hud", "ui-focus", "scan", "crt", "box-scan"])
      expect(modules).toContain(m);
    // No whole-frame posterize or wireframe any more.
    expect(of("dither")).toEqual([]);
    expect(of("wire-scan")).toEqual([]);
    const steps = of("box-scan");
    const focus = layer("track-gorilla").parameters;
    for (const step of steps) {
      // The treatment is confined to the focus box the HUD draws.
      for (const k of ["x", "y", "w", "h"])
        expect(step.parameters[k], `${step.id} ${k}`).toBe(focus[k]);
    }
    // More posterize, fewer levels as the loop goes; the wireframe comes in
    // over the last two beats before the drop.
    const p = steps.map((l) => l.parameters);
    // Subtle (the owner, v4): the gorilla still reads as the gorilla.
    expect(
      Math.max(...p.map((x) => x.posterize as number)),
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.min(...p.map((x) => x.levels as number)),
    ).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < p.length; i++) {
      expect(p[i].posterize).toBeGreaterThanOrEqual(
        p[i - 1].posterize as number,
      );
      expect(p[i].levels).toBeLessThanOrEqual(p[i - 1].levels as number);
    }
    expect(steps.map((l) => [l.startBeat, l.parameters.wire])).toEqual([
      [S + 15, 0],
      [S + 17, 0],
      [S + 19, 0],
      [S + 21, 0.25],
      [S + 22, 0.5],
    ]);
  });

  it("ends on the house end card; every live word is in IBM Plex Mono", () => {
    const end = layer("end-card");
    expect(end.module).toBe("end-card-still");
    expect(end.startBeat).toBe(S + 43);
    expect(end.startBeat + end.beats).toBe(cut.beats);
    expect(end.parameters).toMatchObject({
      eyebrow: "MADE WITH",
      title: "GENOBI",
      subtitle: "DANCE WITH FRUITS",
      still: "/media/director-templates/fruits-swap/fruits-swap-end-card.jpg",
    });
    for (const l of cut.layers)
      if (typeof l.parameters.font === "string")
        expect(l.parameters.font, l.id).toMatch(/^"?IBM Plex Mono/);
  });

  it("uses only trusted recipes, each layer valid", () => {
    for (const l of cut.layers) {
      expect(TRUSTED_RECIPES[l.module], l.id).toBeDefined();
      expect(validate(l.module, l.parameters), l.id).toBe(true);
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
