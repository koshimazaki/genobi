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
/** v6: the cut's one pink, brighter, for every line and plate; words are white. */
const PINK = "#ff4dff";
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
    const [first, second, ...flood] = of("sprite-shower");
    // The splash is the shower itself, thickening on beat 2 (v5: no apple,
    // no words; the typed title on the mecha is the only title).
    expect([first.startBeat, second.startBeat + second.beats]).toEqual([0, S]);
    expect(second.parameters.density).toBeGreaterThan(
      first.parameters.density as number,
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
    // Each card's still is the held frame, darkened already (no words in
    // it), so the card does not dim it again.
    expect(cards.map((c) => [c.parameters.still, c.parameters.dim])).toEqual([
      [`/media/director-templates/fruits-swap/fruits-swap-card-1.jpg`, 0],
      [`/media/director-templates/fruits-swap/fruits-swap-card-2.jpg`, 0],
    ]);
    // v7: every word is a live layer, editable in the Director.
    expect(of("kinetic").map((w) => [w.parameters.text, w.startBeat])).toEqual([
      ["GORILLA", S + 13],
      ["WATERMELON", S + 23],
      ["PINK CAT", S + 28],
    ]);
    expect(of("speech-bubble")).toEqual([]);
  });

  it("types the title live on the eighth, a pink cursor after it", () => {
    const [title] = of("typewriter");
    expect([title.startBeat, title.beats]).toEqual([S, 7]);
    expect(title.parameters).toMatchObject({
      text: "DANCE WITH FRUITS",
      cursorColor: PINK,
      chars: 2,
      division: 2,
      bpm: cut.bpm,
    });
  });

  it("covers the opening's third hand with a live swarm of pixel fruit", () => {
    // The defect: clip frames 36 to 54 of the opening mecha, near its
    // right shoulder (x 0.42-0.65, y 0-0.35).
    const [swarm] = of("sprite-swarm");
    const mecha = cut.shots.find((s) => s.asset === "fruits-swap-mecha")!;
    const clip0 = beatFrame(cut, mecha.startBeat);
    const start = beatFrame(cut, swarm.startBeat);
    const end = beatFrame(cut, swarm.startBeat + swarm.beats);
    const p = swarm.parameters as Record<string, number>;
    // Gathered before the defect shows, bursting only after it has gone.
    expect(start + p.gather * cut.fps).toBeLessThanOrEqual(clip0 + 36);
    expect(start + p.burst * cut.fps).toBeGreaterThanOrEqual(clip0 + 55);
    expect(end).toBeGreaterThan(clip0 + 60);
    // The disc reaches the defect's corners (a 1920 x 1080 frame).
    const r = p.radius * 1920;
    for (const [x, y] of [
      [0.42, 0],
      [0.65, 0],
      [0.42, 0.35],
      [0.65, 0.35],
    ])
      expect(
        Math.hypot((x - p.x) * 1920, (y - p.y) * 1080),
        `${x}, ${y}`,
      ).toBeLessThan(r + 6 * p.size);
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
    for (const m of ["hud", "ui-focus", "scan-lock", "crt", "box-scan"])
      expect(modules).toContain(m);
    // The lock flips to the owner's line, white on the pink plate.
    expect(layer("scan-gorilla").parameters).toMatchObject({
      text: "GORILLA",
      locked: "GORILLA SALSA / DANCE UNLOCKED",
      color: "#f6f8f2",
      accent: PINK,
    });
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

  it("ends on the house end card; the pixel words are in Press Start 2P", () => {
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
    // The pixel words in the bundled OFL arcade face; the end card and the
    // readouts keep the studio's IBM Plex Mono.
    for (const l of [...of("kinetic"), ...of("typewriter")])
      expect(l.parameters.font, l.id).toBe('"Press Start 2P", monospace');
    expect(end.parameters.font).toMatch(/^"IBM Plex Mono"/);
  });

  it("draws every line and plate in one neon pink, no lime left", () => {
    const json = JSON.stringify(cut).toLowerCase();
    for (const lime of ["#d5ff70", "#bed782", "#eaf2df"])
      expect(json).not.toContain(lime);
    const colours = new Set(
      cut.layers.flatMap((l) =>
        ["color", "accent"]
          .map((k) => l.parameters[k])
          .filter((v): v is string => typeof v === "string" && v[0] === "#"),
      ),
    );
    // Pink, white type, and Signal black behind the slams' offset only.
    expect([...colours].sort()).toEqual([PINK, "#f6f8f2", "#0c0e0c"].sort());
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
