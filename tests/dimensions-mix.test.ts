import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import { galleryTemplates, templateSeconds } from "../shared/gallery/catalogue";
import { galleryPage } from "../shared/gallery/page";
import {
  findHouseTemplate,
  findMixTemplate,
  houseTemplates,
} from "../shared/templates/catalogue";
import { dimensionsMix } from "../shared/templates/dimensions-mix";
import {
  beatFrame,
  checkMix,
  mixFrames,
  mixProject,
} from "../shared/templates/mix";
import { checkTemplate } from "../shared/templates/plan";
import { checkMixTemplate, runKind } from "../shared/templates/run-kind";
import validators from "../src/director/generated-validators.mjs";
import { templateCards } from "../src/director/TemplateCards";
import { mixBundle, mixBytes } from "./dimensions-mix-fixtures";

const MIX_RECIPES = [
  "screen-open",
  "build-panel",
  "scan",
  "kinetic",
  "hud",
  "wire-scan",
  "slice-glitch",
  "end-card",
];
const cut = dimensionsMix.mix!.cut;
const graphics = new URL("../docs/director-bundle/example/", import.meta.url);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const media = () =>
  Object.fromEntries(
    Object.entries(dimensionsMix.mix!.media).map(([id, m]) => [
      id,
      { ...m, sha256: "0".repeat(64) },
    ]),
  );
const validate = (moduleId: string, parameters: unknown) =>
  validators[`module_${TRUSTED_RECIPES[moduleId].file.sha256}`](parameters);

describe("the mix recipes in the trusted registry", () => {
  it.each(MIX_RECIPES)("%s is registered with its file's hash", (id) => {
    const m = TRUSTED_RECIPES[id];
    expect(m).toBeDefined();
    expect(m.engine).toBe(m.mode === "filter" ? "threejs" : "animejs");
    expect(sha(readFileSync(new URL(m.file.path, graphics)))).toBe(
      m.file.sha256,
    );
    // Every parameter is required, and no other name is accepted.
    expect([...(m.parameterSchema.required as string[])].sort()).toEqual(
      Object.keys(m.parameterSchema.properties!).sort(),
    );
  });

  it("accepts every layer's parameters in the cut and refuses a missing, extra or out-of-range one", () => {
    for (const layer of cut.layers)
      expect(validate(layer.module, layer.parameters), layer.id).toBe(true);
    const kinetic = cut.layers.find((l) => l.module === "kinetic")!;
    const { size: _size, ...missing } = kinetic.parameters;
    expect(validate("kinetic", missing)).toBe(false);
    expect(validate("kinetic", { ...kinetic.parameters, extra: 1 })).toBe(
      false,
    );
    expect(validate("kinetic", { ...kinetic.parameters, size: 999 })).toBe(
      false,
    );
    // A font stack names families; it cannot carry CSS of its own.
    expect(
      validate("kinetic", { ...kinetic.parameters, font: "x; color: red" }),
    ).toBe(false);
    const scan = cut.layers.find((l) => l.module === "scan")!;
    expect(validate("scan", { ...scan.parameters, x: 1.5 })).toBe(false);
    expect(validate("scan", { ...scan.parameters, text: "A\u0000B" })).toBe(
      false,
    );
    const glitch = cut.layers.find((l) => l.module === "slice-glitch")!;
    expect(
      validate("slice-glitch", { ...glitch.parameters, slices: 2.5 }),
    ).toBe(false);
    const panel = cut.layers.find((l) => l.module === "build-panel")!;
    expect(validate("build-panel", { ...panel.parameters, side: "top" })).toBe(
      false,
    );
  });
});

describe("the Dimensions mix cut", () => {
  it("is 13.5 bars at 140 BPM from the 25.55 s drop, at its clips' 24 fps, every cut on a beat", () => {
    expect(cut).toMatchObject({ bpm: 140, inPointSeconds: 25.55, fps: 24 });
    expect(cut.beats).toBe(54);
    expect(mixFrames(cut)).toBe(555);
    // One beat is 10.2857 frames at 24 fps: frames are derived, never stored.
    expect(beatFrame(cut, 1)).toBe(10);
    expect(beatFrame(cut, 32)).toBe(329);
    let at = 0;
    for (const shot of cut.shots) {
      expect(shot.startBeat).toBe(at);
      at += shot.beats;
    }
    // The shots end on bar 12; the end card layer holds from there.
    expect(at).toBe(44);
    // The biggest hit: the reassembled creature and the title on bar 9.
    const title = cut.layers.find((l) => l.id === "title")!;
    expect(title.startBeat).toBe(32);
    expect(cut.shots.find((s) => s.startBeat === 32)?.label).toMatch(
      /reassembled/,
    );
    // The end card holds to the end: no fade layer.
    expect(cut.layers.find((l) => l.id === "end-card")).toMatchObject({
      module: "end-card",
      startBeat: 44,
      beats: 10,
    });
  });

  it("refuses an off-beat cut, a gap, an overlapping lane or a slice past its source", () => {
    const broken = (change: (c: typeof cut) => void) => {
      const c = structuredClone(cut);
      change(c);
      return () => checkMix(c, media());
    };
    expect(broken(() => {})).not.toThrow();
    expect(
      broken((c) => {
        c.shots[1].startBeat += 0.5;
        c.shots[0].beats += 0.5;
        c.shots[1].beats -= 0.5;
      }),
    ).toThrow("off the beat");
    expect(broken((c) => (c.shots[0].beats -= 1))).toThrow("gap");
    expect(
      broken((c) => c.layers.push({ ...c.layers.at(-1)!, id: "again" })),
    ).toThrow("overlaps");
    expect(broken((c) => (c.shots[0].sourceSeconds = 13))).toThrow(
      "past its source",
    );
    expect(broken((c) => (c.shots[0].cropY = 700))).toThrow("outside");
  });

  it("builds the same validated project from the same media, with the recipes it uses", async () => {
    const a = await mixBundle(),
      b = await mixBundle();
    expect(a.project).toEqual(b.project);
    expect(a.project.composition).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 24,
      bpm: 140,
      durationFrames: 555,
    });
    expect(Object.keys(a.project.modules).sort()).toEqual(
      [...MIX_RECIPES].sort(),
    );
    expect(a.project.generationPlans).toEqual([]);
    const shots = a.project.layers.filter((l) => l.track === "shots");
    expect(shots).toHaveLength(cut.shots.length);
    // A square clip covers the frame; its window starts at the slice's crop.
    expect(shots[0]).toMatchObject({ scale: 960 / 540 });
    expect(shots.at(-1)).toMatchObject({ assetId: "mix-02" });
    expect(a.project.assets["mix-end"]).toBeUndefined();
    expect(a.project.layers[0]).toMatchObject({
      kind: "audio",
      assetId: "mix-track",
      durationFrames: 555,
    });
  });

  it("keeps each bundled clip within 3 MB and the media as the template names it", () => {
    for (const [id, bytes] of Object.entries(mixBytes())) {
      if (id.startsWith("mix-0")) expect(bytes.length).toBeLessThan(3_000_000);
      expect(bytes.length).toBeGreaterThan(0);
    }
    const preview = new URL(
      "../public/media/template-gallery/dimensions-mix.mp4",
      import.meta.url,
    );
    // The owner's upscaled render at 1920 × 1080 (30 October 2026), under
    // the 25 MiB Pages limit until the size pass before deploy.
    expect(statSync(preview).size).toBeLessThan(25 * 1024 * 1024);
  });
});

describe("the Dimensions mix template", () => {
  it("is a mix with nothing to generate, which the planner refuses", () => {
    expect(runKind(dimensionsMix)).toBe("mix");
    expect(() => checkMixTemplate(dimensionsMix)).not.toThrow();
    expect(() => checkTemplate(dimensionsMix)).toThrow("no shots");
    expect(() =>
      checkMixTemplate({ ...dimensionsMix, mix: undefined }),
    ).toThrow("no cut");
    expect(() =>
      checkMixTemplate({ ...dimensionsMix, references: [{} as never] }),
    ).toThrow("no shots or references");
  });

  it("is second in the gallery, first in the Director's list, and not a house template", () => {
    expect(galleryTemplates[1]).toBe(dimensionsMix);
    expect(templateCards[0].id).toBe("dimensions-mix");
    expect(houseTemplates).not.toContain(dimensionsMix);
    expect(findHouseTemplate("dimensions-mix")).toBeUndefined();
    expect(findMixTemplate("dimensions-mix")).toBe(dimensionsMix);
    expect(templateSeconds(dimensionsMix)).toBeCloseTo(23.125);
  });

  it("has a watch page for its preview, at the render's own size", () => {
    const page = galleryPage("/watch/dimensions-mix", "https://example.test")!;
    expect(page.body).toContain("/media/template-gallery/dimensions-mix.mp4");
    expect(page.body).toContain('og:video:width" content="1920"');
  });

  it("builds a project the mix project function agrees with", () => {
    const m = media();
    const p = mixProject(cut, "Dimensions mix", m, TRUSTED_RECIPES);
    expect(p.id).toBe("dimensions-mix");
    expect(p.layers.map((l) => l.id)).toContain("title");
  });
});
