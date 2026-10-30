import { readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import {
  BLOOM_PROMPT,
  BLOOM_SHEET,
  bloomTeaser,
} from "../shared/templates/bloom-teaser";
import { findMixTemplate } from "../shared/templates/catalogue";
import { checkMix, mixFrames, mixProject } from "../shared/templates/mix";
import validators from "../src/director/generated-validators.mjs";

const mix = bloomTeaser.mix!;
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
const DIR = "public/media/director-templates/bloom-teaser";

describe("Bloom, the anime teaser", () => {
  it("is a mix template the Director opens", () => {
    expect(findMixTemplate("bloom-teaser")).toBe(bloomTeaser);
    expect(bloomTeaser).toMatchObject({ name: "Bloom", run: "mix" });
    expect(bloomTeaser.tier).toBe("open");
  });

  it("fits the owner's 19-second track, end card inside it", () => {
    expect(() => checkMix(cut, media())).not.toThrow();
    expect(cut.bpm).toBe(140);
    // The cut ends inside the track: no silence after it.
    expect(mixFrames(cut)).toBe(458);
    expect(mixFrames(cut)).toBeLessThanOrEqual(
      Math.round(mix.media["bloom-track"].durationSeconds * cut.fps),
    );
    expect(cut).toMatchObject({ fps: 24, width: 1920, height: 1080 });
    const project = mixProject(cut, bloomTeaser.name, media(), TRUSTED_RECIPES);
    expect(project.composition.durationFrames).toBe(458);
    const end = cut.layers.find((l) => l.module === "end-card-still")!;
    expect(end.startBeat + end.beats).toBe(cut.beats);
    expect(end.parameters).toMatchObject({
      title: "BLOOM",
      subtitle: "ANIME TEASER",
      credit1: "MUSIC · KOSHIMAZAKI",
    });
  });

  it("uses only trusted recipes, each layer valid", () => {
    for (const layer of cut.layers) {
      expect(TRUSTED_RECIPES[layer.module], layer.id).toBeDefined();
      expect(validate(layer.module, layer.parameters), layer.id).toBe(true);
    }
    // The character-sheet scan is Space.js over the bundled sheet.
    const scan = cut.layers.find((l) => l.module === "space-hud")!;
    expect(scan.parameters.still).toBe(BLOOM_SHEET);
  });

  it("plays only the owner's two MiniMax H3 takes, on one track slot", () => {
    expect(new Set(cut.shots.map((s) => s.asset))).toEqual(
      new Set(["bloom-h3-a", "bloom-h3-b"]),
    );
    expect(cut.track.asset).toBe("bloom-track");
    expect(mix.media["bloom-track"].kind).toBe("audio");
  });

  it("keeps the bundled media within the Pages and project limits", () => {
    let total = 0;
    for (const name of readdirSync(DIR)) {
      const size = statSync(`${DIR}/${name}`).size;
      expect(size, name).toBeLessThan(25 * 1024 * 1024);
      total += size;
    }
    expect(total).toBeLessThan(150 * 1024 * 1024);
  });

  it("records the owner's prompt verbatim, and names files after the piece", () => {
    expect(BLOOM_PROMPT).toContain("<<<img1>>>");
    expect(BLOOM_PROMPT.startsWith("animate each pose")).toBe(true);
    // Inputs are copied and renamed: every bundled file is named for Bloom.
    for (const name of readdirSync(DIR))
      expect(name).toMatch(/^bloom-[a-z0-9-]+\.(mp4|mp3|jpg)$/);
  });
});
