import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
  emptyFilters,
  findGalleryTemplate,
  footageEntries,
  GALLERY_ORDER,
  GALLERY_SUBTITLE,
  galleryMedia,
  gallerySeconds,
  galleryTemplates,
  matchesFilters,
  NOT_IN_GALLERY,
  openOnly,
} from "../shared/gallery/catalogue";
import {
  footageLabel,
  footageMadeWith,
  galleryBadge,
  modelName,
} from "../shared/gallery/badges";
import { galleryPage } from "../shared/gallery/page";
import { generationTemplates } from "../shared/gallery/generations";
import { registry } from "../shared/registry";
import { findHouseTemplate } from "../shared/templates/catalogue";

/** The encode check runs only where ffprobe is installed. */
const hasFfprobe = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const card = (id: string) => galleryTemplates.find((t) => t.id === id)!;

describe("gallery card order", () => {
  it("follows the owner's order: the submission pieces first, the generation cards last", () => {
    expect(galleryTemplates.map((t) => t.name)).toEqual([
      "Genobi teaser",
      "Dimensions mix",
      "Bloom",
      "Character piece",
      "Audio-visual",
      "Sheet to shot",
      "Forest guardian",
      "Toy creatures",
    ]);
    // Every listed id is a card, and every card is listed.
    expect(galleryTemplates.map((t) => t.id)).toEqual(GALLERY_ORDER);
  });

  it("drops the Anime teaser and Product video cards, but not their templates", () => {
    // The Dimensions mix is the anime teaser; the Genobi teaser is the
    // product video (the owner, 30 October 2026).
    for (const id of ["anime-teaser", "product-video"]) {
      expect(NOT_IN_GALLERY.has(id)).toBe(true);
      expect(findGalleryTemplate(id)).toBeUndefined();
      expect(findHouseTemplate(id)).toBeDefined();
    }
    // Bloom replaced the Neon bloom card (the owner, 30 October 2026); its
    // generation card and watch page stay.
    expect(NOT_IN_GALLERY.has("audio-visual-generation")).toBe(true);
    expect(findGalleryTemplate("audio-visual-generation")).toBeUndefined();
    expect(
      generationTemplates.some((t) => t.id === "audio-visual-generation"),
    ).toBe(true);
    // Product video's clip still plays on Toy creatures and its watch page.
    expect(galleryMedia(card("product-video-generation"))!.video).toBe(
      "/media/template-gallery/product-video.mp4",
    );
    expect(
      galleryPage("/watch/product-video", "https://studio.test"),
    ).toBeDefined();
  });

  it("says what the teasers are for", () => {
    expect(GALLERY_SUBTITLE).toEqual({
      "genobi-teaser": "Product teaser",
      "dimensions-mix": "Music video",
      "bloom-teaser": "Anime teaser",
    });
    expect(card("bloom-teaser").name).toBe("Bloom");
    // The Dimensions mix keeps its id and name, so links and showcases hold.
    expect(card("dimensions-mix").name).toBe("Dimensions mix");
  });

  it("shows the GENOBI title frame as the teaser's poster, at the cut's size", () => {
    const media = galleryMedia(card("genobi-teaser"))!;
    expect(media.poster).toBe("/media/template-gallery/genobi-teaser.jpg");
    expect(media).toMatchObject({ width: 1920, height: 1080 });
    const jpg = readFileSync(`public${media.poster}`);
    // The JPEG's SOF0 frame header carries its height then width.
    const sof = jpg.indexOf(Buffer.from([0xff, 0xc0]));
    expect([jpg.readUInt16BE(sof + 7), jpg.readUInt16BE(sof + 5)]).toEqual([
      1920, 1080,
    ]);
    expect(jpg.length).toBeLessThan(200 * 1024);
  });

  it("leaves the Open only toggle's cards as they were", () => {
    const open = galleryTemplates.filter((t) =>
      matchesFilters(t, { ...emptyFilters, open: "open" }),
    );
    expect(open.map((t) => t.id).sort()).toEqual([
      "bloom-teaser",
      "dimensions-mix",
      "genobi-teaser",
      "sheet-to-shot",
    ]);
  });
});

describe("model badges", () => {
  it("name each card's model and route from the registry", () => {
    expect(
      Object.fromEntries(
        galleryTemplates.map((t) => [t.name, galleryBadge(t).label]),
      ),
    ).toEqual({
      "Genobi teaser": "MiniMax H3 + FLUX 3 video · open + API",
      "Character piece": "LTX-2.5 · open weights",
      "Dimensions mix": "MiniMax H3 · open weights",
      Bloom: "MiniMax H3 · open weights",
      "Audio-visual": "LTX-2.5 · open weights",
      "Sheet to shot": "MiniMax H3 · open weights",
      "Forest guardian": "FLUX 3 video · API",
      "Toy creatures": "FLUX 3 video · API",
    });
  });

  it("read the names from registry labels", () => {
    expect(modelName("flux-3-i2v")).toBe("FLUX 3 video");
    expect(modelName("flux-3-image")).toBe("FLUX 3 image");
    expect(modelName("flux-3-klein")).toBe("FLUX 3 Klein");
    expect(modelName("ltx-2-5-fast")).toBe("LTX-2.5");
    expect(modelName("ltx-2-5-akuspace")).toBe("LTX-2.5");
    expect(modelName("ltx-2-5-pro")).toBe("LTX-2.5 Pro");
    expect(modelName("minimax-h3-router")).toBe("MiniMax H3");
    expect(modelName("flux-video-upscale")).toBe("FLUX Video Upscale");
    // Follows the registry: a renamed label renames the badge.
    const entry = registry.find((e) => e.id === "minimax-h3-router")!;
    const label = entry.label;
    try {
      entry.label = "MiniMax H4";
      expect(galleryBadge(card("sheet-to-shot")).label).toBe(
        "MiniMax H4 · open weights",
      );
    } finally {
      entry.label = label;
    }
  });

  it("say a mix's footage in the tooltip, or bundled clips when mixed", () => {
    expect(galleryBadge(card("dimensions-mix")).detail).toBe(
      "Nothing to generate: a finished cut of MiniMax H3 (open weights) clips",
    );
    expect(galleryBadge(card("bloom-teaser")).detail).toBe(
      "Nothing to generate: a finished cut of MiniMax H3 (open weights) clips",
    );
    // Teaser v3 names its generated footage; the rest is screen recordings.
    expect(galleryBadge(card("genobi-teaser")).detail).toBe(
      "Nothing to generate: a finished cut of MiniMax H3 + FLUX 3 video (open + API) clips",
    );
  });
});

describe("footage lines", () => {
  /** What each card's footage label reads where it shows one. */
  const lines = () =>
    Object.fromEntries(
      galleryTemplates.map((t) => [
        t.name,
        galleryMedia(t)?.demo ? footageLabel(t) : null,
      ]),
    );

  it("name the model that made the clip each card plays", () => {
    expect(lines()).toEqual({
      "Genobi teaser": null,
      "Dimensions mix": null,
      Bloom: null,
      "Character piece": "Preview footage · FLUX 3 video",
      "Audio-visual": "Preview footage · MiniMax H3",
      "Sheet to shot": null,
      "Forest guardian": null,
      "Toy creatures": "Preview footage · FLUX 3 video",
    });
    for (const t of [
      card("character-piece"),
      findHouseTemplate("product-video")!,
    ])
      expect(footageMadeWith(t)).toBe("made with FLUX 3 video (API)");
    // Forest guardian is a recorded run, so its drawer says what made it.
    expect(footageEntries(card("character-piece-generation"))).toEqual([
      "flux-3-i2v",
    ]);
  });

  it("say the same on the watch pages", () => {
    for (const [id, made] of [
      ["character-piece", "made with FLUX 3 video (API)"],
      ["product-video", "made with FLUX 3 video (API)"],
    ]) {
      const page = galleryPage(`/watch/${id}`, "https://studio.test")!;
      expect(page.body).toContain(`Preview footage, ${made}.`);
      expect(page.body).not.toContain("LTX");
    }
  });

  it("leave the badges and Open only on the recipe", () => {
    // The footage is FLUX 3, the recipe LTX-2.5: the badge keeps the recipe.
    expect(galleryBadge(card("character-piece")).label).toBe(
      "LTX-2.5 · open weights",
    );
    expect(openOnly(card("character-piece"))).toBe(false);
  });
});

describe("Audio-visual preview footage", () => {
  const av = findHouseTemplate("audio-visual")!;
  const media = galleryMedia(av)!;

  it("plays the owner's MiniMax H3 clips, still labelled preview footage", () => {
    expect(media).toMatchObject({
      video: "/media/template-gallery/audio-visual-h3.mp4",
      poster: "/media/template-gallery/audio-visual-h3.jpg",
      demo: true,
      width: 960,
      height: 406,
    });
    expect(gallerySeconds(av)).toBe(13.5);
    expect(footageEntries(av)).toEqual(["minimax-h3"]);
    expect(footageLabel(av)).toBe("Preview footage · MiniMax H3");
    expect(footageMadeWith(av)).toBe("made with MiniMax H3 (open weights)");
    // Its badge still names its own recipe, not the footage.
    expect(galleryBadge(av).detail).toBe(
      "LTX-2.5 · Acoustic Space (open weights)",
    );
    const page = galleryPage("/watch/audio-visual", "https://studio.test")!;
    expect(page.body).toContain(
      "Preview footage, made with MiniMax H3 (open weights).",
    );
  });

  it("leaves Neon bloom and the teaser on the original clip", () => {
    const neon = generationTemplates.find(
      (t) => t.generation!.clip === "audio-visual",
    )!;
    expect(galleryMedia(neon)!.video).toBe(
      "/media/template-gallery/audio-visual.mp4",
    );
    // The lotus clip is FLUX 3 video, named by the file Neon bloom plays.
    expect(footageLabel(neon)).toBe("Preview footage · FLUX 3 video");
    expect(existsSync("public/media/template-gallery/audio-visual.mp4")).toBe(
      true,
    );
  });

  it("records its provenance and stays small", () => {
    expect(statSync(`public${media.video}`).size).toBeLessThan(
      25 * 1024 * 1024,
    );
    for (const doc of [
      "LICENCES.md",
      "docs/template-gallery.md",
      "docs/submission.md",
    ]) {
      const text = readFileSync(doc, "utf8");
      expect(text).toContain("audio-visual-h3");
      expect(text).not.toMatch(new RegExp(atob("bWFnbmlmaWM="), "i"));
    }
  });

  it.skipIf(!hasFfprobe)("is a 960 × 406 encode with no metadata", () => {
    const file = `public${media.video}`;
    const probe = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,width,height,r_frame_rate:format=duration:format_tags",
        "-of",
        "json",
        file,
      ]).toString(),
    );
    expect(probe.streams).toEqual([
      { codec_type: "video", width: 960, height: 406, r_frame_rate: "24/1" },
    ]);
    expect(Number(probe.format.duration)).toBeCloseTo(13.5);
    expect(Object.keys(probe.format.tags ?? {}).sort()).toEqual([
      "compatible_brands",
      "major_brand",
      "minor_version",
    ]);
  });
});
