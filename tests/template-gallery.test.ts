import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  findHouseTemplate,
  houseTemplates,
  mixTemplates,
} from "../shared/templates/catalogue";
import {
  emptyFilters,
  findGalleryTemplate,
  NOT_IN_GALLERY,
  openOnly,
  galleryMedia,
  galleryTemplates,
  matchesFilters,
  templateSeconds,
} from "../shared/gallery/catalogue";
import { generationTemplates } from "../shared/gallery/generations";
import { TIER_LABEL, galleryBadge, modelLine } from "../shared/gallery/badges";
import { tierOf } from "../shared/templates/plan";
import { embedMarkup, galleryPage } from "../shared/gallery/page";
import { initialPreset } from "../src/studio/presets";

// Watch and embed pages are the house templates' alone; the generation
// cards are tests/gallery-generations.test.ts.
const previewed = houseTemplates.filter((t) => galleryMedia(t));

describe("template gallery", () => {
  it("uses the canonical catalogue and labels demo media without inventing examples", () => {
    // The same cards, in GALLERY_ORDER (tests/gallery-badges-order.test.ts).
    expect(new Set(galleryTemplates)).toEqual(
      new Set([
        ...mixTemplates,
        ...houseTemplates.filter((t) => !NOT_IN_GALLERY.has(t.id)),
        ...generationTemplates.filter((t) => !NOT_IN_GALLERY.has(t.id)),
      ]),
    );
    // The anime teaser template has no preview footage and no watch or embed
    // page; it is no longer a card (the Dimensions mix is the anime teaser).
    expect(previewed.map((t) => t.id)).toEqual([
      "product-video",
      "character-piece",
      "audio-visual",
    ]);
    expect(galleryMedia(findHouseTemplate("anime-teaser")!)).toBeUndefined();
    expect(galleryPage("/watch/anime-teaser", "https://studio.test")).toBe(
      undefined,
    );
    for (const template of previewed) {
      const media = galleryMedia(template)!;
      expect(media.demo).toBe(template.examples.length === 0);
      expect(existsSync(`public${media.video}`)).toBe(true);
      expect(existsSync(`public${media.poster}`)).toBe(true);
    }
  });
  it("filters recipe metadata rather than unrelated preview duration", () => {
    const short = galleryTemplates.filter((t) =>
      matchesFilters(t, { ...emptyFilters, kind: "template", length: "short" }),
    );
    expect(short.map((t) => t.id)).toEqual(["audio-visual", "sheet-to-shot"]);
    expect(short.every((t) => templateSeconds(t) <= 10)).toBe(true);
    // FLUX 3 is closed, so only the generation cards are Premium.
    expect(
      galleryTemplates.filter((t) =>
        matchesFilters(t, { ...emptyFilters, tier: "premium" }),
      ),
    ).toEqual(generationTemplates.filter((t) => !NOT_IN_GALLERY.has(t.id)));
    expect(
      galleryTemplates.filter((t) =>
        matchesFilters(t, { ...emptyFilters, tool: "3D" }),
      ),
    ).toEqual([]);
  });
  it("no longer lists Falling room, but its links and saved projects still resolve", () => {
    expect([...NOT_IN_GALLERY]).toEqual([
      "falling-room",
      "anime-teaser",
      "product-video",
      "audio-visual-generation",
    ]);
    expect(galleryTemplates.map((t) => t.id)).not.toContain("falling-room");
    expect(findGalleryTemplate("falling-room")).toBeUndefined();
    // No preview footage and no watch or embed page.
    const falling = findHouseTemplate("falling-room")!;
    expect(galleryMedia(falling)).toBeUndefined();
    expect(galleryPage("/watch/falling-room", "https://studio.test")).toBe(
      undefined,
    );
    expect(existsSync("public/media/template-gallery/falling-room.mp4")).toBe(
      false,
    );
    // /director?example=falling-room and saved projects still find it
    // (tests/falling-room-template.test.ts opens and plans one).
    expect(falling.name).toBe("Falling room");
  });

  it("badges every card from the registry, never by hand", () => {
    for (const t of galleryTemplates)
      expect(galleryBadge(t).tier).toBe(t.mix ? t.tier : tierOf(t));
    for (const t of generationTemplates) {
      expect(galleryBadge(t).label).toBe("FLUX 3 video · API");
      expect(galleryBadge(t).detail).toBe("FLUX 3 image to video (API)");
    }
    expect(modelLine("ltx-2-5-fast")).toBe(
      "LTX-2.5 Fast text to video (open weights)",
    );
    // The Tier filter still names tiers.
    expect(TIER_LABEL).toEqual({
      open: "Open models",
      "semi-open": "Semi-open",
      premium: "API model",
    });
  });

  it("Open only keeps open recipes that show no borrowed preview footage", () => {
    const shown = galleryTemplates.filter((t) =>
      matchesFilters(t, { ...emptyFilters, open: "open" }),
    );
    expect(shown.map((t) => t.id)).toEqual([
      "genobi-teaser",
      "dimensions-mix",
      "bloom-teaser",
      "sheet-to-shot",
    ]);
    expect(shown.every(openOnly)).toBe(true);
    expect(shown.some((t) => t.generation)).toBe(false);
    expect(shown.some((t) => galleryMedia(t)?.demo)).toBe(false);
    // Off by default: every card shows.
    expect(
      galleryTemplates.filter((t) => matchesFilters(t, emptyFilters)),
    ).toEqual(galleryTemplates);
  });

  it("opens Gallery by default and preserves explicit tools and job links", () => {
    expect(initialPreset("/", "")).toBe("gallery");
    expect(initialPreset("/director", "?example=character-piece")).toBe(
      "director",
    );
    expect(initialPreset("/", "?workspace=camera")).toBe("camera");
    expect(initialPreset("/", "?job=existing")).toBe("camera");
    expect(initialPreset("/world-builder", "")).toBe("world");
  });
});

describe("curated public embeds", () => {
  it("renders metadata and a branded player without opening private media", () => {
    const watch = galleryPage("/watch/character-piece", "https://studio.test")!;
    expect(watch.body).toContain('property="og:video"');
    expect(watch.body).toContain(
      "https://studio.test/media/template-gallery/character-piece.mp4",
    );
    expect(watch.body).toContain("not a generated result");
    expect(watch.body).toContain("Genobi</a>");
    expect(watch.headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    const embed = galleryPage("/embed/character-piece", "https://studio.test")!;
    expect(embed.headers["Content-Security-Policy"]).toContain(
      "frame-ancestors *",
    );
    expect(embed.headers["Permissions-Policy"]).toContain("microphone=()");
    expect(embed.body).not.toContain("/api/");
    expect(embedMarkup("character-piece", "https://studio.test")).toContain(
      'src="https://studio.test/embed/character-piece"',
    );
  });
  it.each(previewed.map((t) => t.id))(
    "gives %s a complete link preview: absolute URLs, video type, size and poster",
    (id) => {
      const origin = "https://studio.test";
      const { body } = galleryPage(`/watch/${id}`, origin)!;
      const meta = (key: string) =>
        new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(
          body,
        )?.[1];
      const media = galleryMedia(findHouseTemplate(id)!)!;
      expect(meta("og:video")).toBe(`${origin}${media.video}`);
      expect(meta("og:video:secure_url")).toBe(`${origin}${media.video}`);
      expect(meta("og:video:type")).toBe("video/mp4");
      expect(meta("og:image")).toBe(`${origin}${media.poster}`);
      expect(meta("twitter:image")).toBe(`${origin}${media.poster}`);
      for (const key of ["og:video", "og:image"]) {
        expect(meta(`${key}:width`)).toBe(String(media.width));
        expect(meta(`${key}:height`)).toBe(String(media.height));
      }
      expect(meta("twitter:card")).toBe("player");
      expect(meta("twitter:player")).toBe(`${origin}/embed/${id}`);
      expect(meta("twitter:player:width")).toBe(String(media.width));
      expect(meta("twitter:player:height")).toBe(String(media.height + 44));
      expect(meta("twitter:player:stream:content_type")).toBe("video/mp4");
      expect(meta("og:url")).toBe(`${origin}/watch/${id}`);
      expect(embedMarkup(id, origin)).toContain(
        `width="${media.width}" height="${media.height + 44}"`,
      );
      // A plain-HTTP origin (the local server) claims no secure URL.
      expect(
        galleryPage(`/watch/${id}`, "http://127.0.0.1:4317")!.body,
      ).not.toContain("secure_url");
    },
  );
  it.each([
    "/embed/private-job",
    "/watch/%3Cscript%3E",
    "/embed/../api/jobs",
    "/api/media/character-piece",
    "/embed/character-piece/extra",
  ])("refuses non-catalogue path %s", (path) => {
    expect(galleryPage(path, "https://studio.test")).toBeUndefined();
  });
});
