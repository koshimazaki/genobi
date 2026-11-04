// Every gallery card is a skill with a brief (the owner's decision of
// 4 November 2026): the brief tells a viewer what they can hand in and what
// happens to it, and the card's skill is what an agent follows when they do.
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { galleryTemplates } from "../shared/gallery/catalogue";
import { fruitsSwap } from "../shared/templates/fruits-swap";
import { checkBrief, runKind } from "../shared/templates/run-kind";

afterEach(() => vi.unstubAllGlobals());

const skillFile = (id: string) => `plugins/genobi/skills/${id}/SKILL.md`;

describe("gallery briefs", () => {
  it("gives every gallery card a brief a viewer can read at a glance", () => {
    expect(galleryTemplates.length).toBeGreaterThan(5);
    for (const template of galleryTemplates) {
      expect(template.brief, template.id).toBeTruthy();
      expect(() => checkBrief(template), template.id).not.toThrow();
    }
  });

  it("keeps a skill for every card an agent runs", () => {
    // A mechanical card runs in the gallery and needs none.
    for (const template of galleryTemplates) {
      if (runKind(template) === "mechanical") continue;
      const file = skillFile(template.id);
      expect(existsSync(file), file).toBe(true);
      const text = readFileSync(file, "utf8");
      expect(text, file).toMatch(new RegExp(`^name: ${template.id}$`, "m"));
      expect(text, file).toMatch(
        new RegExp(`^\\s+template: "${template.id}"$`, "m"),
      );
    }
  });

  it("refuses a brief that is empty, too long or more than three sentences", () => {
    const at = (brief: string) => () => checkBrief({ id: "t", brief });
    expect(at("")).toThrow("one to three plain sentences");
    expect(at(" Padded. ")).toThrow();
    expect(at("One. Two. Three. Four.")).toThrow();
    expect(at("a".repeat(481))).toThrow();
    expect(at("Tab\there.")).toThrow();
    expect(
      at("Drop a clip. Say what it replaces. It is quoted."),
    ).not.toThrow();
    expect(() => checkBrief({ id: "t" })).not.toThrow();
  });

  it("shows the brief in the drawer under the description, before the actions", async () => {
    vi.stubGlobal("location", { origin: "http://127.0.0.1:4317" });
    const { default: TemplateDrawer } =
      await import("../src/template-gallery/TemplateDrawer");
    const html = renderToStaticMarkup(
      <TemplateDrawer
        template={fruitsSwap}
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
    const escape = (s: string) => s.replace(/'/g, "&#x27;");
    const description = html.indexOf(`<p>${fruitsSwap.description}</p>`);
    const brief = html.indexOf(
      `<p class="template-card-brief">${escape(fruitsSwap.brief!)}</p>`,
    );
    expect(description).toBeGreaterThan(0);
    expect(brief).toBeGreaterThan(description);
    expect(html.indexOf("Take it to Director")).toBeGreaterThan(brief);
  });
});
