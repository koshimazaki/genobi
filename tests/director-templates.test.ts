import { describe, expect, it } from "vitest";
import { mixTemplates } from "../shared/templates/catalogue";
import { templateCards } from "../src/director/TemplateCards";
import {
  DEFAULT_DIRECTOR_TEMPLATE,
  directorRoute,
  templateAddress,
} from "../src/director/route-template";
import { initialPreset } from "../src/studio/presets";
import { editorLink } from "../src/template-gallery/template-actions";
import { showcaseLink } from "../shared/showcase/types";

describe("offered Director/Editor templates", () => {
  it("offers the finished mixes and no placeholder recipes", () => {
    expect(templateCards.map((t) => t.id)).toEqual(
      mixTemplates.map((t) => t.id),
    );
    expect(templateCards.map((t) => t.name)).toEqual([
      "Dimensions mix",
      "Genobi teaser",
      "Bloom",
      "Adaptive reverb",
    ]);
  });

  it("uses Dimensions mix in the shared loader, including retired template URLs", () => {
    expect(DEFAULT_DIRECTOR_TEMPLATE).toBe("dimensions-mix");
    for (const search of [
      "",
      "?workspace=editor",
      "?template=character-intro",
      "?template=outfit-reveal",
      "?template=poster-motion",
    ])
      expect(directorRoute(search).id).toBe("dimensions-mix");
  });

  it.each(mixTemplates)(
    "routes $name to the Editor with the matching cut",
    (template) => {
      const url = new URL(editorLink(template.id), "https://studio.test");
      expect(initialPreset(url.pathname, url.search)).toBe("editor");
      expect(directorRoute(url.search).id).toBe(template.id);
    },
  );

  it("clears a previous showcase when choosing another template in the Editor", () => {
    const url = templateAddress(
      "adaptive-reverb",
      "https://studio.test/director?showcase=bloom-teaser&version=1&template=poster-motion&workspace=editor",
    );
    expect(url.searchParams.has("showcase")).toBe(false);
    expect(url.searchParams.has("version")).toBe(false);
    expect(url.searchParams.has("template")).toBe(false);
    expect(initialPreset(url.pathname, url.search)).toBe("editor");
    expect(directorRoute(url.search).id).toBe("adaptive-reverb");
  });

  it("preserves links to the hidden Character piece template", () => {
    expect(directorRoute("?example=character-piece").id).toBe(
      "character-piece",
    );
  });

  it("resolves showcase editor links to their own project IDs", () => {
    const url = new URL(showcaseLink("bloom-teaser", 1), "https://studio.test");
    expect(initialPreset(url.pathname, url.search)).toBe("editor");
    expect(directorRoute(url.search).id).toBe("bloom-teaser-v1");
    expect(() => directorRoute("?showcase=private-job&version=1")).toThrow(
      "unavailable",
    );
  });
});
