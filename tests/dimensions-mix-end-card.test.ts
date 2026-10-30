import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCommand } from "../shared/director/commands";
import { BUNDLED_FONTS, portableFallback } from "../shared/director/fonts";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import { dimensionsMix } from "../shared/templates/dimensions-mix";
import { checkMix, type MixSpec } from "../shared/templates/mix";
import validators from "../src/director/generated-validators.mjs";
import { buildMixBundle } from "../src/director/mix-template";
import { validateProject } from "../src/director/validate";
import { mixBundle, mixBytes } from "./dimensions-mix-fixtures";
import { base } from "./house-template-fixtures";

// The end card is a recipe layer, not a baked video: its words are
// parameters an editor or agent changes, and the construction build is
// drawn live (docs/dimensions-mix.md#the-end-card). The pixels are checked
// in Chrome by scripts/check-end-card.mjs.
const cut = dimensionsMix.mix!.cut;
const card = cut.layers.find((l) => l.id === "end-card")!;
const recipe = TRUSTED_RECIPES["end-card"];
const valid = (parameters: unknown) =>
  validators[`module_${recipe.file.sha256}`](parameters);

describe("the end-card recipe", () => {
  it("is registered by its file's hash, every parameter required", () => {
    const source = readFileSync(
      new URL(
        `../docs/director-bundle/example/${recipe.file.path}`,
        import.meta.url,
      ),
    );
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      recipe.file.sha256,
    );
    expect(recipe).toMatchObject({ engine: "animejs", mode: "overlay" });
    expect([...(recipe.parameterSchema.required as string[])].sort()).toEqual(
      Object.keys(recipe.parameterSchema.properties!).sort(),
    );
  });

  it("loads the construction effect unchanged rather than carrying a copy", () => {
    const source = readFileSync(
      new URL(
        `../docs/director-bundle/example/${recipe.file.path}`,
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toContain("/motion/construction/");
    expect(source).not.toMatch(/function (buildOverlay|measure|drawStroke)/);
  });

  it("defaults to the capture's card with the Koshimazaki Mix credit", () => {
    expect(card).toMatchObject({
      module: "end-card",
      kind: "graphics",
      startBeat: 44,
      beats: 10,
      opacity: 1,
    });
    expect(card.parameters).toEqual({
      eyebrow: "PRODUCED BY",
      title: "GENOBI 2026",
      subtitle: "SUPERNATURAL CREATURES",
      credit1: "MUSIC · DIMENSIONS",
      credit2: "KOSHIMAZAKI MIX",
      font: '"Nokia Cellphone FC", "Pixelify Sans", monospace',
      color: "#d5ff70",
      accent: "#e6a1ff",
      steps:
        "Finding the signal / Assembling the form / Bringing it into focus",
      done: "First look",
      duration: 2.6,
    });
    expect(valid(card.parameters)).toBe(true);
    // The build (2.6 s x 1.09) is over well inside the card's 10 beats.
    expect(2.6 * 1.09).toBeLessThan((10 * 60) / cut.bpm);
  });

  it("refuses a missing, extra, empty, over-long or unsafe parameter", () => {
    const p = card.parameters;
    const { credit2: _credit2, ...missing } = p;
    expect(valid(missing)).toBe(false);
    expect(valid({ ...p, extra: "x" })).toBe(false);
    expect(valid({ ...p, title: "" })).toBe(false);
    expect(valid({ ...p, title: "X".repeat(25) })).toBe(false);
    expect(valid({ ...p, credit2: "A\u0000B" })).toBe(false);
    expect(valid({ ...p, font: "x; color: red" })).toBe(false);
    expect(valid({ ...p, color: "red" })).toBe(false);
    expect(valid({ ...p, duration: 20 })).toBe(false);
    // An empty line is allowed: the card simply leaves it out.
    expect(valid({ ...p, credit1: "" })).toBe(true);
  });
});

describe("the mix's fonts", () => {
  it("draw the bundled Nokia Cellphone FC everywhere, with no local font", () => {
    expect(BUNDLED_FONTS.map((f) => f.family)).toContain("Nokia Cellphone FC");
    const stacks = cut.layers.flatMap((l) =>
      typeof l.parameters.font === "string" ? [l.parameters.font] : [],
    );
    expect(stacks).toHaveLength(4);
    for (const s of stacks) {
      expect(s).not.toMatch(/Explorers|Retro Gaming/);
      expect(portableFallback(s)).toBe("Nokia Cellphone FC");
    }
    const font = readFileSync(
      new URL(
        "../public/motion/fonts/nokia-fc/nokiafc22.woff2",
        import.meta.url,
      ),
    );
    expect(font.subarray(0, 4).toString("latin1")).toBe("wOF2");
    expect(
      readFileSync(
        new URL(
          "../public/motion/fonts/nokia-fc/nokiafc22.txt",
          import.meta.url,
        ),
        "latin1",
      ),
    ).toContain("distribute as you wish");
  });
});

describe("the end card in the mix project", () => {
  it("is a full-frame graphics layer under the filters, from frame 453 to the end", async () => {
    const { project } = await mixBundle();
    expect(project.composition.durationFrames).toBe(555);
    const i = project.layers.findIndex((l) => l.id === "end-card");
    expect(project.layers[i]).toMatchObject({
      kind: "graphics",
      moduleId: "end-card",
      startFrame: 453,
      durationFrames: 102,
      opacity: 1,
    });
    // The bar-12 glitch still runs over it, as it ran over the video.
    const glitch = project.layers.findIndex((l) => l.id === "glitch-7");
    expect(glitch).toBeGreaterThan(i);
    expect(project.modules["end-card"]).toEqual(recipe);
  });

  it("changes its words with set-parameters and refuses a name it does not take", async () => {
    const { project } = await mixBundle();
    const from = { project, prompt: "" };
    const result = applyCommand(from, {
      op: "set-parameters",
      layerId: "end-card",
      parameters: { title: "KOSHIMAZAKI", credit2: "KOSHIMAZAKI MIX" },
    });
    if (!result.ok) throw new Error(result.error);
    validateProject(result.copy.project);
    const layer = result.copy.project.layers.find((l) => l.id === "end-card")!;
    expect(layer).toMatchObject({
      parameters: {
        title: "KOSHIMAZAKI",
        credit2: "KOSHIMAZAKI MIX",
        eyebrow: "PRODUCED BY",
      },
    });
    const refused = applyCommand(from, {
      op: "set-parameters",
      layerId: "end-card",
      parameters: { credit: "x" },
    });
    expect(refused.ok).toBe(false);
  });

  it("needs the card to hold the cut's end once the shots stop", () => {
    const media = Object.fromEntries(
      Object.entries(dimensionsMix.mix!.media).map(([id, m]) => [
        id,
        { ...m, sha256: "0".repeat(64) },
      ]),
    );
    const without = (change: (c: MixSpec) => void) => {
      const c = structuredClone(cut);
      change(c);
      return () => checkMix(c, media);
    };
    expect(without(() => {})).not.toThrow();
    expect(
      without((c) => (c.layers = c.layers.filter((l) => l.id !== "end-card"))),
    ).toThrow("do not fill");
    expect(
      without(
        (c) => (c.layers.find((l) => l.id === "end-card")!.opacity = 0.5),
      ),
    ).toThrow("do not fill");
    expect(
      without((c) => (c.layers.find((l) => l.id === "end-card")!.beats = 9)),
    ).toThrow("do not fill");
  });
});

describe("a project saved before the end card was editable", () => {
  it("still builds and validates with its mix-end video shot", async () => {
    // The cut as it was: the card was a 102-frame video on the shots lane.
    const old = structuredClone(cut);
    old.layers = old.layers.filter((l) => l.id !== "end-card");
    old.shots.push({
      asset: "mix-end",
      label: "End card · produced by Genobi 2026",
      sourceSeconds: 0,
      startBeat: 44,
      beats: 10,
      cropY: null,
    });
    const template = {
      ...dimensionsMix,
      mix: {
        cut: old,
        media: {
          ...dimensionsMix.mix!.media,
          "mix-end": {
            kind: "video" as const,
            url: "/media/director-templates/dimensions-mix/mix-end.mp4" as const,
            path: "media/mix-end.mp4",
            durationSeconds: 102 / 24,
          },
        },
      },
    };
    const bytes = mixBytes();
    // Any bytes stand in for the old capture: validation checks the hash
    // the project records, and that the file is in the bundle.
    const bundle = await buildMixBundle(template, base(), {
      ...bytes,
      "mix-end": bytes["mix-03"],
    });
    expect(bundle.project.layers.find((l) => l.id === "shot-13")).toMatchObject(
      { assetId: "mix-end", startFrame: 453, durationFrames: 102 },
    );
    expect(bundle.project.modules["end-card"]).toBeUndefined();
    expect(bundle.files.has("media/mix-end.mp4")).toBe(true);
    expect(() => validateProject(bundle.project)).not.toThrow();
  });
});
