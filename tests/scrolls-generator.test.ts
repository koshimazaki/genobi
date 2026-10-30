import { describe, expect, it } from "vitest";
import { applyScrollCommand, createScroll } from "../shared/scrolls/commands";
import {
  checkReferenceSizes,
  cleanName,
  DEFAULT_GENERATOR,
  emptyPanels,
  estimatePerRun,
  fitGenerator,
  generationRecord,
  generatorInput,
  generatorPrompt,
  referenceProblem,
  resultName,
} from "../shared/scrolls/generator";
import { parseAsset, type ScrollAsset } from "../shared/scrolls/types";

const REF = { name: "Sky Gate", url: "data:image/png;base64,AAAA" };
const MADE = {
  name: "Mine",
  prompt: "A ninja sheet, ink on paper.",
  url: REF.url,
};
function board() {
  let d = createScroll("storyboard", 3, "gen-board");
  d = applyScrollCommand(d, {
    op: "brief",
    revision: d.revision,
    prompt: "Two ninjas cross the rooftops.",
  });
  d.cells = d.cells.map((c, i) => ({
    ...c,
    title: ["Standoff", "Clash", "Escape"][i],
    prompt: ["They face off", "Blades meet", "One vanishes"][i],
    camera: ["Locked", "Push in", "Pull back"][i],
  }));
  return d;
}

describe("the Scrolls generator builds its request from the prompt and references", () => {
  it("runs Klein open on text alone, with the brief and nothing else for a sheet", () => {
    const d = { ...board(), kind: "character" as const };
    const input = generatorInput(d, DEFAULT_GENERATOR, {});
    expect(input).toMatchObject({
      generator: "image",
      model: "flux-3-klein",
      imageReferences: [],
      imageAspectRatio: "16:9",
      imageResolution: "1k",
    });
    expect(input.description).toMatch(/character sheet as a single image/);
    expect(input.description).not.toMatch(/Standoff/);
  });

  it("refuses references on Klein's open graph and names the routes that take them", () => {
    expect(referenceProblem("flux-3-klein", 1)).toMatch(
      /Run: API.*FLUX 3 Edit/,
    );
    expect(() =>
      generatorInput(board(), DEFAULT_GENERATOR, { references: [REF] }),
    ).toThrow(/open graph takes text only/);
    expect(referenceProblem("flux-3-klein-api", 10)).toBeUndefined();
    expect(referenceProblem("flux-3-klein-api", 11)).toMatch(/up to 10/);
    expect(referenceProblem("flux-3-edit", 0)).toMatch(/at least one/);
  });

  it("sends the references to Klein's API with the words that say what they are for", () => {
    const input = generatorInput(
      board(),
      { ...DEFAULT_GENERATOR, entry: "flux-3-klein-api" },
      { references: [REF, REF], includePlan: true },
    );
    expect(input.model).toBe("flux-3-klein-api");
    expect(input.generator).toBe("image");
    expect(input.imageReferences).toEqual([REF.url, REF.url]);
    expect(input.description.split("\n")[0]).toBe(
      "Made like these 2 examples, the reference images in order:",
    );
  });

  it("pairs each reference with its recorded prompt, and never invents one", () => {
    const prompt = generatorPrompt(board(), { pairs: [MADE, REF] });
    const lines = prompt.split("\n");
    expect(lines[1]).toBe(
      'Reference 1: its prompt: "A ninja sheet, ink on paper.".',
    );
    expect(lines[2]).toBe("Reference 2: no prompt recorded.");
    expect(lines[3]).toMatch(
      /^Make a new storyboard the same way.*changed to:$/,
    );
    expect(lines[4]).toMatch(/storyboard sheet as a single image/);
    expect(lines[5]).toBe("Two ninjas cross the rooftops.");
    const long = generatorPrompt(board(), {
      pairs: [{ name: "Long", prompt: "x".repeat(5000) }],
    });
    expect(long).toContain(`"${"x".repeat(600)}…"`);
  });

  it("runs FLUX 3 Edit as an edit of the first reference, as the anime teaser does", () => {
    const input = generatorInput(
      board(),
      { ...DEFAULT_GENERATOR, entry: "flux-3-edit" },
      { references: [REF] },
    );
    expect(input).toMatchObject({ generator: "edit", model: "flux-3" });
  });

  it("compiles the board's panels, in order and with their timing, under the brief", () => {
    const d = board();
    d.timing = { ...d.timing, enabled: true };
    const prompt = generatorPrompt(d, { includePlan: true });
    const lines = prompt.split("\n");
    expect(lines[1]).toBe("Two ninjas cross the rooftops.");
    expect(prompt.indexOf("Standoff")).toBeLessThan(prompt.indexOf("Clash"));
    expect(prompt).toMatch(/1\. Standoff \(0\.0–\d+\.\d s\): They face off/);
    expect(prompt).toMatch(/Camera intention: Push in\./);
  });

  it("fills only empty panels, one panel's own text at a time", () => {
    const d = board();
    d.assets = [
      {
        id: "done",
        name: "done.png",
        role: "panel",
        kind: "image",
        origin: "uploaded",
        file: { path: "media/done.png", sha256: "a".repeat(64) },
      },
    ];
    d.cells[1] = { ...d.cells[1], assetId: "done" };
    expect(emptyPanels(d).map((c) => c.title)).toEqual(["Standoff", "Escape"]);
    const one = generatorPrompt(d, { cellId: d.cells[2].id });
    expect(one).toMatch(/One clean storyboard frame/);
    expect(one).toMatch(/One vanishes/);
    expect(one).not.toMatch(/They face off/);
  });

  it("refits ratio and tier when the model changes, as the Camera composer does", () => {
    const api = fitGenerator({
      entry: "flux-3-klein-api",
      imageAspectRatio: "auto",
      imageResolution: "1.5k",
    });
    expect(api).toMatchObject({
      imageAspectRatio: "auto",
      imageResolution: "1.5k",
    });
    expect(fitGenerator({ ...api, entry: "flux-3-klein" })).toMatchObject({
      imageAspectRatio: "1:1",
      imageResolution: "1.5k",
    });
    expect(fitGenerator({ ...api, entry: "flux-3-edit" })).toMatchObject({
      imageResolution: "1k",
    });
  });

  it("prices one run from the same table the quote uses", () => {
    expect(estimatePerRun(DEFAULT_GENERATOR)).toBe(0.009);
    expect(estimatePerRun({ ...DEFAULT_GENERATOR, entry: "flux-3-edit" })).toBe(
      0.048,
    );
  });

  it("holds references to the server's per-file and combined limits", () => {
    expect(() => checkReferenceSizes([6 * 1024 * 1024])).toThrow(/5 MB/);
    expect(() => checkReferenceSizes([4e6, 4e6, 4e6])).toThrow(/11 MB/);
    expect(() => checkReferenceSizes([3e6, 3e6])).not.toThrow();
  });
});

describe("a generated sheet records how it was made", () => {
  const generated = (extra: object): unknown => ({
    id: "made",
    name: "Klein API · storyboard",
    role: "panel",
    kind: "image",
    origin: "generated",
    prompt: "A board",
    file: { path: "media/made.png", sha256: "b".repeat(64) },
    ...extra,
  });

  it("strips control characters from names before they are stored", () => {
    expect(cleanName("Sky\x00 Gate\x1f\x7f · sheet\n")).toBe(
      "Sky Gate · sheet",
    );
    const record = generationRecord("flux-3-klein-api", [
      { name: "Rooftop\x07 Escape", sha256: "c".repeat(64) },
    ]);
    expect(record.references[0].name).toBe("Rooftop Escape");
    expect(resultName(board(), "flux-3-klein-api")).toBe(
      "FLUX 3 Image Klein · API · storyboard",
    );
    expect(resultName(board(), "flux-3-edit", board().cells[1].id)).toBe(
      "FLUX 3 Edit · cell 2",
    );
  });

  it("round-trips model and references, and refuses a bad record", () => {
    const record = generationRecord("flux-3-edit", [
      { name: "Sky Gate", sha256: "c".repeat(64) },
    ]);
    const asset = parseAsset(generated({ generation: record })) as ScrollAsset;
    expect(asset.generation).toEqual(record);
    expect(() =>
      parseAsset(generated({ origin: "uploaded", generation: record })),
    ).toThrow(/generated/);
    expect(() =>
      parseAsset(
        generated({
          generation: {
            entry: "flux-3-edit",
            references: [{ name: "x", sha256: "z" }],
          },
        }),
      ),
    ).toThrow(/hash/);
    expect(() =>
      parseAsset(
        generated({
          generation: {
            entry: "flux-3-edit",
            references: [{ name: "bad\x00", sha256: "c".repeat(64) }],
          },
        }),
      ),
    ).toThrow(/control/);
  });
});
