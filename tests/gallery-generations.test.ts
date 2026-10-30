// The gallery's generation cards: the three preview clips as single FLUX 3
// image-to-video runs of one start image and one prompt, which the owner
// supplies. Until then a card claims nothing about its clip.
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  emptyFilters,
  galleryMedia,
  gallerySeconds,
  galleryTemplates,
  NOT_IN_GALLERY,
  matchesFilters,
  templateTools,
} from "../shared/gallery/catalogue";
import {
  GENERATION_ENTRY,
  generationRecords,
  generationTemplate,
  generationTemplates,
  readGenerationRecord,
} from "../shared/gallery/generations";
import { requiredKeyKind } from "../shared/provider";
import type { Quote } from "../shared/quote";
import {
  findHouseTemplate,
  houseTemplates,
} from "../shared/templates/catalogue";
import { startingPicks } from "../shared/templates/intake";
import {
  mechanicalDefaults,
  mechanicalInput,
} from "../shared/templates/mechanical";
import { checkTemplate, planTemplate } from "../shared/templates/plan";
import { isMechanical } from "../shared/templates/run-kind";
import type { Job } from "../shared/types";
import { validateInput } from "../server/validation";
import { platePng } from "../src/director/plate";
import {
  addResultToAssets,
  quoteMechanical,
  submitMechanical,
} from "../src/template-gallery/mechanical-run";
import {
  BFL_ONLY,
  generationClaim,
} from "../src/template-gallery/GenerationNote";

const png = platePng(256, 256, "#203040", "#f0e0d0");
const dataUrl = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
const readImage = async () => dataUrl;
const QUOTE: Quote = {
  id: "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
  estimateUsd: 2.5,
  recipe: {} as Quote["recipe"],
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};
const PROMPT = "The figure turns toward the light as petals drift past.";
// A card the owner has not recorded yet: empty prompt, no start image.
const unrecordedCard = generationTemplates.find(
  (t) => !t.generation!.recorded,
)!;
const filled = generationTemplate("character-piece", {
  image: "/media/template-gallery/character-piece-start.png",
  prompt: PROMPT,
});

const shownGenerations = generationTemplates.filter(
  (t) => !NOT_IN_GALLERY.has(t.id),
);

describe("generation cards", () => {
  it("are the three preview clips, one card each, keyed by the owner's record", () => {
    expect(Object.keys(generationRecords)).toEqual([
      "character-piece",
      "product-video",
      "audio-visual",
    ]);
    expect(generationTemplates.map((t) => t.generation!.clip)).toEqual(
      Object.keys(generationRecords),
    );
    // The generation cards precede the pending Sheet to shot preview.
    expect(galleryTemplates.slice(-3, -1)).toEqual(shownGenerations);
    for (const t of generationTemplates) {
      expect(() => checkTemplate(t)).not.toThrow();
      expect(isMechanical(t)).toBe(true);
      expect(t.shots.map((s) => s.entry)).toEqual([GENERATION_ENTRY]);
      expect(planTemplate(t).shots[0].input.model).toBe("flux-3-i2v");
      const media = galleryMedia(t)!;
      expect(media.video).toBe(
        `/media/template-gallery/${t.generation!.clip}.mp4`,
      );
      expect(existsSync(`public${media.video}`)).toBe(true);
      expect(existsSync(`public${media.poster}`)).toBe(true);
      expect(gallerySeconds(t)).toBeGreaterThan(19);
      expect(templateTools(t)).toEqual(["Camera"]);
      // Generation cards open Camera, not a Director recipe.
      expect(findHouseTemplate(t.id)).toBeUndefined();
    }
    expect(houseTemplates.some((t) => t.generation)).toBe(false);
  });

  it("ship with no prompt and no start image until the owner gives them", () => {
    // Character piece is recorded (tests/gallery-generation-record.test.tsx).
    const unrecorded = ["product-video", "audio-visual"] as const;
    for (const clip of unrecorded)
      expect(generationRecords[clip]).toEqual({ image: "", prompt: "" });
    for (const t of generationTemplates.filter((t) =>
      (unrecorded as readonly string[]).includes(t.generation!.clip),
    )) {
      expect(t.generation!.recorded).toBe(false);
      expect(galleryMedia(t)!.demo).toBe(true);
      expect(mechanicalDefaults(t).prompt).toBe("");
      expect(t.references[0].example).toBeUndefined();
      expect(startingPicks(t)).toEqual({ start: "missing" });
      expect(generationClaim(t.generation!)).not.toMatch(/made from/i);
      expect(generationClaim(t.generation!)).toMatch(/^Preview footage/);
    }
  });

  it("say the clip was made from the image and prompt only once recorded", () => {
    expect(filled.generation).toEqual({
      clip: "character-piece",
      prompt: PROMPT,
      recorded: true,
    });
    expect(galleryMedia(filled)!.demo).toBe(false);
    expect(mechanicalDefaults(filled).prompt).toBe(PROMPT);
    expect(filled.references[0].example).toBe(
      "/media/template-gallery/character-piece-start.png",
    );
    expect(startingPicks(filled)).toEqual({ start: "example" });
    expect(generationClaim(filled.generation!)).toBe(
      "Made from this start image and prompt with FLUX 3 image to video.",
    );
    // One without the other is still unrecorded.
    const half = generationTemplate("product-video", {
      image: "",
      prompt: PROMPT,
    });
    expect(half.generation!.recorded).toBe(false);
    expect(galleryMedia(half)!.demo).toBe(true);
  });

  it("refuse a record that is not an image beside the clips and a plain prompt", () => {
    for (const image of [
      "/media/library-01.jpg",
      "https://example.test/a.png",
      "/media/template-gallery/../secret.png",
      "/media/template-gallery/start.gif",
    ])
      expect(() => readGenerationRecord("x", { image, prompt: "" })).toThrow(
        "PNG, JPEG or WebP",
      );
    expect(() =>
      readGenerationRecord("x", { image: "", prompt: "a".repeat(1201) }),
    ).toThrow("at most 1200");
    expect(() =>
      readGenerationRecord("x", { image: "", prompt: "a\u0000b" }),
    ).toThrow("plain text");
  });

  it("run on BFL direct and say so", () => {
    expect(requiredKeyKind("flux-3-i2v")).toBe("bfl");
    expect(BFL_ONLY).toContain("needs a BFL key");
  });

  it("read as Generation in the gallery's Kind filter", () => {
    const kind = (k: string) =>
      galleryTemplates.filter((t) =>
        matchesFilters(t, { ...emptyFilters, kind: k }),
      );
    expect(kind("generation")).toEqual(shownGenerations);
    expect(kind("template")).toEqual(
      galleryTemplates.filter((t) => !t.generation),
    );
  });
});

describe("Generate on a generation card", () => {
  const dropped = {
    picks: { start: "yours" } as const,
    dropped: {
      start: [{ bytes: png, ext: "png" as const, origin: "uploaded" as const }],
    },
  };

  it("quotes nothing until the person gives a start image and a prompt", async () => {
    const card = unrecordedCard;
    const quote = vi.fn(async () => QUOTE);
    await expect(
      quoteMechanical(
        card,
        { picks: startingPicks(card), dropped: {} },
        mechanicalDefaults(card),
        { key: "", quote, readImage },
      ),
    ).rejects.toThrow("Start image is required");
    await expect(
      quoteMechanical(card, dropped, mechanicalDefaults(card), {
        key: "",
        quote,
        readImage,
      }),
    ).rejects.toThrow("Write a prompt");
    expect(quote).not.toHaveBeenCalled();
  });

  it("quotes once, then submits exactly that run once after approval", async () => {
    const card = unrecordedCard;
    const quote = vi.fn(async () => QUOTE);
    const recipe = { ...mechanicalDefaults(card), prompt: PROMPT };
    const approval = await quoteMechanical(card, dropped, recipe, {
      key: "",
      quote,
      readImage,
    });
    expect(quote).toHaveBeenCalledOnce();
    expect(approval.input).toMatchObject({
      generator: "video",
      model: "flux-3-i2v",
      description: PROMPT,
      duration: 5,
      aspectRatio: "16:9",
      imageReferences: [dataUrl],
    });
    // The Camera's own validator takes it as it would a Camera run.
    expect(validateInput(approval.input).model).toBe("flux-3-i2v");
    // Nothing is submitted until the person confirms the quoted price.
    const events: string[] = [];
    const record = vi.fn((run: { state: string }) =>
      events.push(`record ${run.state}`),
    );
    const generate = vi.fn(async () => {
      events.push("submit");
      return { id: "job-12345678", status: "submitting" } as Job;
    });
    expect(events).toEqual([]);
    await submitMechanical(approval, { record, generate });
    expect(events).toEqual(["record submitting", "submit", "record started"]);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith(approval.input, {
      quoteId: QUOTE.id,
      idempotency: approval.idempotency,
    });
  });

  it("refuses a length or ratio FLUX 3 does not offer", () => {
    const recipe = { ...mechanicalDefaults(filled), prompt: PROMPT };
    expect(
      mechanicalInput(filled, { ...recipe, duration: 20 }, [dataUrl]).duration,
    ).toBe(20);
    expect(() =>
      mechanicalInput(filled, { ...recipe, duration: 25 }, [dataUrl]),
    ).toThrow("cannot make that length");
    expect(() =>
      mechanicalInput(filled, { ...recipe, aspect: "1:1" }, [dataUrl]),
    ).toThrow("takes 16:9 or 21:9 or 9:16");
  });

  it("adds a result only to a project already open", async () => {
    const card = unrecordedCard;
    const open = vi.fn();
    const add = vi.fn();
    const job = {
      id: "job-12345678",
      status: "Ready",
      resultUrl: "/api/jobs/job-12345678/result",
    } as Job;
    const store = {
      getState: () => ({ director: { bundle: undefined } }),
    } as unknown as NonNullable<
      Parameters<typeof addResultToAssets>[3]
    >["store"];
    await expect(
      addResultToAssets(card, { picks: {}, dropped: {} }, job, {
        open,
        add,
        store,
      }),
    ).rejects.toThrow("Open a project in Director first");
    expect(open).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});
