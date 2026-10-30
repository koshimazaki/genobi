// The Character piece card (Forest guardian) carries the owner's record: the
// start image, the prompt as they wrote it, and the FLUX 3 controls they ran
// it with. Opening the card fills the drawer with all of it; nothing is
// quoted or submitted until the person presses Generate and confirms.
import { readFileSync, statSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fluxVideoControls } from "../shared/controls";
import {
  GENERATION_ENTRY,
  generationRecords,
  generationTemplates,
  readGenerationRecord,
} from "../shared/gallery/generations";
import type { Quote } from "../shared/quote";
import { readyEntry } from "../shared/registry";
import { startingPicks } from "../shared/templates/intake";
import {
  mechanicalControls,
  mechanicalDefaults,
} from "../shared/templates/mechanical";
import { validateInput } from "../server/validation";
import { platePng } from "../src/director/plate";
import { generationClaim } from "../src/template-gallery/GenerationNote";
import { quoteMechanical } from "../src/template-gallery/mechanical-run";

afterEach(() => vi.unstubAllGlobals());

const START = "/media/template-gallery/character-piece-start.webp";
const PROMPT =
  "animate the character make it train ninja moves and tai-chi and shooting fireballs. It should come close to the screen so its whole face makes the extreme close-up showing weathered cybernetic eyes reflecting forest behind him in the iris, camera is still no movement, only character moves withing the scene. Making anime ninja style training moves and moves closer to camera at 15sec blinking eye at the end. Keep aesthethics as on the image1.";
const card = generationTemplates.find(
  (t) => t.generation!.clip === "character-piece",
)!;
const png = platePng(256, 256, "#203040", "#f0e0d0");
const dataUrl = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
const QUOTE: Quote = {
  id: "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
  estimateUsd: 2.5,
  recipe: {} as Quote["recipe"],
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("the Character piece record", () => {
  it("is the owner's start image, prompt word for word, and controls", () => {
    expect(generationRecords["character-piece"]).toEqual({
      image: START,
      prompt: PROMPT,
      settings: { duration: 20, aspect: "21:9", resolution: "hd" },
    });
    // The settings were written after the prompt; they are not part of it.
    expect(PROMPT).not.toMatch(/duration|aspect_ratio|resolution/);
    expect(card.generation).toEqual({
      clip: "character-piece",
      prompt: PROMPT,
      recorded: true,
      settings: { duration: 20, aspect: "21:9", resolution: "hd" },
    });
    expect(generationClaim(card.generation!)).toBe(
      "Made from this start image and prompt with FLUX 3 image to video.",
    );
  });

  it("uses values FLUX 3 image to video really offers", () => {
    const entry = readyEntry(GENERATION_ENTRY)!;
    expect(entry.controls).toBe(fluxVideoControls);
    expect(fluxVideoControls.aspectRatios).toContain("21:9");
    expect(fluxVideoControls.resolutions).toContain("hd");
    expect(fluxVideoControls.duration).toEqual({ min: 5, max: 20 });
  });

  it("refuses settings the card or FLUX 3 does not offer", () => {
    const read = (settings: object) =>
      readGenerationRecord("x", {
        image: "",
        prompt: "",
        settings: settings as never,
      });
    for (const duration of [4, 21, 12.5, "20"])
      expect(() => read({ duration })).toThrow("whole seconds from 5 to 20");
    // FLUX 3 takes 1:1, but a generation card offers 16:9, 21:9 or 9:16.
    for (const aspect of ["1:1", "4:3", "21x9"])
      expect(() => read({ aspect })).toThrow("16:9, 21:9, 9:16");
    expect(() => read({ resolution: "8k" })).toThrow("hd, fhd, qhd, uhd");
    expect(() => read({ seed: 4 })).toThrow("unknown settings seed");
    expect(read({ duration: 20, aspect: "21:9", resolution: "hd" })).toEqual({
      image: "",
      prompt: "",
      settings: { duration: 20, aspect: "21:9", resolution: "hd" },
    });
  });
});

describe("opening the Character piece card", () => {
  it("fills the recipe with the image, prompt, length, ratio and resolution", () => {
    expect(mechanicalDefaults(card)).toEqual({
      prompt: PROMPT,
      aspect: "21:9",
      duration: 20,
    });
    expect(mechanicalControls(card).resolution).toBe("HD");
    expect(card.references[0].example).toBe(START);
    expect(startingPicks(card)).toEqual({ start: "example" });
  });

  it("renders the drawer filled in, with the clip's sound on its controls", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("location", { origin: "http://127.0.0.1:4317" });
    const { default: TemplateDrawer } =
      await import("../src/template-gallery/TemplateDrawer");
    const html = renderToStaticMarkup(
      <TemplateDrawer
        template={card}
        onClose={() => {}}
        onGenerate={() => {}}
        onDirector={() => {}}
        onEditor={() => {}}
        busy=""
        error=""
        status=""
        session={false}
      />,
    );
    expect(html).toContain(`>${PROMPT}</textarea>`);
    expect(html).toContain('<option selected="">21:9</option>');
    expect(html).toMatch(
      /<option (selected="" value="20"|value="20" selected="")>20 s<\/option>/,
    );
    expect(html).toContain("FLUX 3 · HD");
    expect(html).toContain('data-reference="start" data-state="example"');
    expect(html).not.toContain("Preview footage");
    // The opened clip plays with controls and is not muted: sound on demand.
    const preview = html.match(
      /<video[^>]*aria-label="Forest guardian preview"[^>]*>/,
    )![0];
    expect(preview).toContain("controls");
    expect(preview).not.toContain("muted");
    expect(preview).not.toContain("autoPlay");
    // Opening the card asks nothing of the network.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("quotes the recorded run with the shipped start image, and submits nothing", async () => {
    const quote = vi.fn(async () => QUOTE);
    const fetchExample = vi.fn(
      async () => new Blob([png], { type: "image/webp" }),
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const approval = await quoteMechanical(
      card,
      { picks: startingPicks(card), dropped: {} },
      mechanicalDefaults(card),
      { key: "", quote, readImage: async () => dataUrl, fetchExample },
    );
    expect(fetchExample).toHaveBeenCalledWith(START);
    expect(quote).toHaveBeenCalledOnce();
    expect(approval.input).toMatchObject({
      generator: "video",
      model: "flux-3-i2v",
      description: PROMPT,
      duration: 20,
      aspectRatio: "21:9",
      resolution: "hd",
      imageReferences: [dataUrl],
    });
    expect(validateInput(approval.input)).toMatchObject({
      model: "flux-3-i2v",
      duration: 20,
      aspectRatio: "21:9",
    });
    // A quote is all Generate does; the paid submission waits for Confirm.
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("the Character piece media", () => {
  const file = (path: string) => readFileSync(`public${path}`);
  const carriesNoLineage = (bytes: Buffer) => {
    for (const marker of [
      "c2pa",
      "jumb",
      "Exif",
      "XMP ",
      "/Users/",
      "/private/",
    ])
      expect(bytes.includes(Buffer.from(marker))).toBe(false);
  };

  it("ships the start image as a stripped WebP within a megabyte", () => {
    const bytes = file(START);
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
    expect(statSync(`public${START}`).size).toBeLessThanOrEqual(1_000_000);
    carriesNoLineage(bytes);
  });

  it("ships the clip with a sound track and no provenance metadata", () => {
    const bytes = file("/media/template-gallery/character-piece.mp4");
    expect(bytes.includes(Buffer.from("soun"))).toBe(true);
    expect(bytes.includes(Buffer.from("mp4a"))).toBe(true);
    expect(bytes.length).toBeLessThanOrEqual(5_000_000);
    carriesNoLineage(bytes);
  });
});
