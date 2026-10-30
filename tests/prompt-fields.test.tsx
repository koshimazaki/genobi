import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { houseTemplates } from "../shared/templates/catalogue";
import { buildTemplateBundle } from "../src/director/house-template";
import { readBrief, type PromptReference } from "../src/director/prompt-brief";
import {
  promptLayout,
  promptLines,
  swatchPieces,
} from "../src/director/prompt-fields";
import { PromptLines, chipHandlers } from "../src/director/PromptLines";
import { previewMedia } from "../src/director/PromptReferencePreview";
import { base, samples } from "./house-template-fixtures";

// The owner's screenshot of 27 October, as the anime teaser composes it.
const brief = [
  "Anime teaser · Ink and ember · Semi-open",
  "Brief: a ninja training in a forest",
  "Title: FIRE FIST",
  "Look: cel-shaded ink",
  "Lighting: low ember key",
  "Palette: paper, ink and ember (Paper #f4efe6, Ink #0f1420, Dusk teal #1f3a4a, Ember #e0602a)",
  "Negative space: wide sky above the figure",
  "Shots: 1. Open, 10 s; 2. Drop, 10 s",
  "References: [Image 1] [Image 2]",
].join("\n");

describe("the project prompt read as fields", () => {
  it("names each labelled line and keeps every line's words", () => {
    const lines = promptLines(brief);
    expect(lines.map((l) => l.field)).toEqual([
      "header",
      "subject",
      "title",
      "look",
      "lighting",
      "palette",
      "negative",
      "shots",
      "references",
    ]);
    // Display only: the lines put back together are the text the agent gets.
    expect(lines.map((l) => l.label + l.body).join("\n")).toBe(brief);
    expect(lines[5].swatches).toEqual([
      "#f4efe6",
      "#0f1420",
      "#1f3a4a",
      "#e0602a",
    ]);
    expect(lines[8].tiles).toBe(true);
    expect(lines.filter((l) => l.tiles)).toHaveLength(1);
  });

  it("leaves prose as plain lines and an empty prompt as no lines", () => {
    expect(promptLines("")).toEqual([]);
    const [line, inline] = promptLines(
      "a ninja leaps: then lands\nUse [Image 1] behind the title",
    );
    expect(line.field).toBeUndefined();
    expect(line.body).toBe("a ninja leaps: then lands");
    expect(inline.tiles).toBe(false);
    // A purpose added at a line's start is a field of large tiles.
    expect(promptLines("Character: [Image 3] ")[0]).toMatchObject({
      field: "subject",
      tiles: true,
    });
    // Swatches belong to the palette field only.
    expect(promptLines("Note: #ffffff")[0].swatches).toEqual([]);
  });

  it("redraws on a new line or label, not on typing inside a body", () => {
    const layout = promptLayout(brief);
    expect(promptLayout(brief.replace("ninja", "ninja girl"))).toBe(layout);
    expect(promptLayout(`${brief}\n`)).not.toBe(layout);
    expect(promptLayout(brief.replace("Look:", "Look"))).not.toBe(layout);
    expect(promptLayout(brief.replace("#e0602a", "#e0602b"))).not.toBe(layout);
  });

  it("splits a palette body around each hex", () => {
    expect(swatchPieces("Paper #f4efe6, Ink #0f1420)")).toEqual([
      { text: "Paper " },
      { text: "#f4efe6", hex: "#f4efe6" },
      { text: ", Ink " },
      { text: "#0f1420", hex: "#0f1420" },
      { text: ")" },
    ]);
  });

  it("composes the template's own brief into the same fields", async () => {
    const anime = houseTemplates.find((t) => t.id === "anime-teaser");
    if (!anime) throw new Error("anime-teaser template missing");
    const bundle = await buildTemplateBundle(base(), anime, {}, samples(anime));
    const fields = promptLines(readBrief(bundle).text).map((l) => l.field);
    expect(fields.slice(0, 8)).toEqual([
      "header",
      "subject",
      "title",
      "look",
      "lighting",
      "palette",
      "negative",
      "shots",
    ]);
  });
});

describe("the fields and reference tiles in the editor", () => {
  const actions = { onSwap: vi.fn(), onPreview: vi.fn(), onDropOn: vi.fn() };
  it("renders a block per line with coloured labels, swatches and tiles", async () => {
    const anime = houseTemplates.find((t) => t.id === "anime-teaser")!;
    const bundle = await buildTemplateBundle(base(), anime, {}, samples(anime));
    const { references } = readBrief(bundle);
    const html = renderToStaticMarkup(
      <div>
        <PromptLines
          text={brief}
          bundle={bundle}
          references={references}
          actions={actions}
        />
      </div>,
    );
    expect(html.match(/class="prompt-line"/g)).toHaveLength(9);
    expect(html).toContain('data-field="palette"');
    expect(html).toContain('<span class="prompt-field-label">Look:</span>');
    // Swatches are decoration: no text, so the prompt text is unchanged.
    expect(html.match(/data-prompt-decoration=""/g)).toHaveLength(4);
    expect(html).toContain("--swatch:#e0602a");
    expect(html).toMatch(/data-field="references" data-tiles="true"/);
    for (const r of references)
      expect(html).toContain(`aria-label="Change ${r.label}"`);
  });
});

describe("a reference chip's events", () => {
  const image: PromptReference = { id: "r1", label: "Image 1", assetId: "a" };
  const font: PromptReference = {
    id: "f1",
    label: "Font 1",
    font: { name: "Plex", file: { path: "brief/fonts/p.woff2", sha256: "" } },
  };
  const event = (patch: object) =>
    ({
      detail: 1,
      currentTarget: { dataset: {} },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { types: ["Files"], dropEffect: "none" },
      ...patch,
    }) as never;

  it("swaps on click and opens the lightbox on double-click", () => {
    const actions = { onSwap: vi.fn(), onPreview: vi.fn(), onDropOn: vi.fn() };
    const h = chipHandlers(image, actions);
    h.onClick(event({}));
    expect(actions.onSwap).toHaveBeenCalledTimes(1);
    // The second click of a double-click does not swap again.
    h.onClick(event({ detail: 2 }));
    h.onDoubleClick(event({ detail: 2 }));
    expect(actions.onSwap).toHaveBeenCalledTimes(1);
    expect(actions.onPreview).toHaveBeenCalledWith(image);
    // A font has nothing to show large.
    chipHandlers(font, actions).onDoubleClick(event({}));
    expect(actions.onPreview).toHaveBeenCalledTimes(1);
  });

  it("takes a media drop on the preview itself", () => {
    const actions = { onSwap: vi.fn(), onPreview: vi.fn(), onDropOn: vi.fn() };
    const h = chipHandlers(image, actions);
    const over = event({});
    h.onDragOver(over);
    expect(
      (over as { preventDefault: () => void }).preventDefault,
    ).toBeCalled();
    const drop = event({});
    h.onDrop(drop);
    expect(actions.onDropOn).toHaveBeenCalledWith(
      image,
      (drop as { dataTransfer: unknown }).dataTransfer,
    );
    // Text drags are left to the editor.
    h.onDrop(event({ dataTransfer: { types: ["text/plain"] } }));
    expect(actions.onDropOn).toHaveBeenCalledTimes(1);
  });

  it("opens a reference's own project file", async () => {
    const anime = houseTemplates.find((t) => t.id === "anime-teaser")!;
    const bundle = await buildTemplateBundle(base(), anime, {}, samples(anime));
    const [first] = readBrief(bundle).references;
    expect(previewMedia(bundle, first)?.kind).toBe("image");
    expect(previewMedia(bundle, font)).toBeUndefined();
  });
});
