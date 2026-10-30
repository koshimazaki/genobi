// The drawer for both run kinds ("Make your own", 27 October 2026): a
// mechanical template shows its output box, its swap slots, an editable
// prompt with ratio and length, and Generate; an agent template keeps
// Generate now, with the brief editable and its prompts read-only.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { animeTeaser, sheetToShot } from "../shared/templates/catalogue";
import type { HouseTemplate } from "../shared/templates/types";
import type { TemplatePicks } from "../src/template-gallery/open-template";

afterEach(() => vi.unstubAllGlobals());

const render = async (template: HouseTemplate, session = false) => {
  vi.stubGlobal("location", { origin: "http://127.0.0.1:4317" });
  const { default: TemplateDrawer } =
    await import("../src/template-gallery/TemplateDrawer");
  return renderToStaticMarkup(
    <TemplateDrawer
      template={template}
      onClose={() => {}}
      onGenerate={() => {}}
      onDirector={() => {}}
      onEditor={() => {}}
      busy=""
      error=""
      status=""
      session={session}
    />,
  );
};

describe("the drawer for a mechanical template", () => {
  it("shows the output box, the swap slots, the editable prompt and Generate", async () => {
    const html = await render(sheetToShot);
    // No example output yet: said, never stood in for.
    expect(html).toContain("Preview coming soon");
    expect(html).not.toContain("<video");
    for (const id of ["character", "storyboard"])
      expect(html).toContain(`data-reference="${id}" data-state="example"`);
    expect(html).toContain('aria-label="Drop your storyboard"');
    // Nothing is made before the run, so there is nothing to generate.
    expect(html).not.toContain('aria-label="Generate the');
    expect(html).toMatch(
      /<textarea class="template-prompt" aria-label="Sheet to shot prompt" maxLength="1200" rows="7">Use the first image as the character sheet/,
    );
    expect(html).toContain("MiniMax H3 · 768P");
    expect(html).toContain('<option value="15">15 s</option>');
    expect(html).not.toContain('<option value="16">');
    expect(html).toContain('<option selected="">16:9</option>');
    expect(html).toContain('data-run="mechanical"');
    expect(html).toMatch(/class="template-primary"[^>]*>Generate</);
    expect(html).not.toContain("Generate now");
    // Both ways further, without a session.
    expect(html).toContain("Take it to Director");
    expect(html).toContain("Take it to the editor");
    expect(html).toContain("Runs here");
    expect(html).toContain("Nothing is spent until you confirm the price.");
  });
});

describe("the drawer for an agent template", () => {
  it("keeps Generate now, with the brief editable and the prompts read-only", async () => {
    const html = await render(animeTeaser);
    expect(html).toContain('data-run="agent"');
    expect(html).toContain("Generate now");
    expect(html).toContain('id="brief-anime-teaser"');
    expect(html).toContain(`value="${animeTeaser.inputs.subject.default}"`);
    expect(html).toContain("Prompts · read-only");
    expect(html).not.toContain('<textarea class="template-prompt"');
    expect(html).toContain("Open · 10 s · MiniMax H3");
    expect(html).toContain("Preview coming soon");
    expect(html).toContain("Made with your agent");
  });
});

describe("after Generate now", () => {
  it("leaves the header's bubble usable once a session works on the template", async () => {
    const { inertBehind } =
      await import("../src/template-gallery/TemplateDrawer");
    expect(inertBehind(false)).toBe(
      ".genobi-shell > .genobi-host, .genobi-grid",
    );
    expect(inertBehind(true)).toBe(".genobi-grid");
    const html = await render(animeTeaser, true);
    expect(html).toContain('aria-modal="false"');
  });

  it("starts one session with the edited brief, and says so when the dialog is closed", async () => {
    const { generateNow, CANCELLED_SPAWN } =
      await import("../src/template-gallery/template-actions");
    const chosen: TemplatePicks = {
      picks: { track: "missing", character: "example", storyboard: "example" },
      dropped: {},
      inputs: { subject: 'a fox\u0007 courier "racing" across rooftops' },
    };
    const open = vi.fn(async () => {});
    const save = vi.fn(async () => true);
    const spawn = vi.fn(async () => undefined);
    expect(
      await generateNow(animeTeaser, chosen, { open, save, spawn }),
    ).toEqual({ session: undefined });
    expect(open).toHaveBeenCalledWith("anime-teaser", chosen);
    expect(spawn).toHaveBeenCalledOnce();
    const [{ prompt }] = spawn.mock.calls[0] as unknown as [{ prompt: string }];
    // The brief is fenced as the person's words: quoted, its own quotes
    // replaced, so it cannot close the quotation.
    expect(prompt).toContain(
      `Brief, in my words: "a fox courier 'racing' across rooftops".`,
    );
    expect(CANCELLED_SPAWN).toBe(
      "Nothing started; the template is open in Director (undo to go back).",
    );
    // An empty brief is refused before anything opens.
    await expect(
      generateNow(
        animeTeaser,
        { ...chosen, inputs: { subject: " " } },
        { open, save, spawn },
      ),
    ).rejects.toThrow("Brief must be 1 to 240 characters");
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("takes a mechanical template's swapped references to the editor", async () => {
    const { takeToEditor } =
      await import("../src/template-gallery/template-actions");
    const open = vi.fn(async () => {});
    const navigate = vi.fn();
    const swapped: TemplatePicks = {
      picks: { character: "yours", storyboard: "example" },
      dropped: {},
    };
    await takeToEditor(sheetToShot, { open, navigate }, swapped);
    expect(open).toHaveBeenLastCalledWith("sheet-to-shot", swapped);
    expect(navigate).toHaveBeenLastCalledWith(
      "/director?example=sheet-to-shot&workspace=editor",
    );
  });
});

describe("a reloaded drawer", () => {
  it("says a run may be in progress and asks before a clean Generate", async () => {
    vi.resetModules();
    const stored = new Map([
      [
        "genobi.gallery.run.sheet-to-shot",
        JSON.stringify({
          key: "11111111-2222-4333-8444-555555555555",
          quoteId: "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
          state: "submitting",
        }),
      ],
    ]);
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: () => {},
      removeItem: () => {},
    });
    const html = await render(sheetToShot);
    expect(html).toContain("A run may be in progress; see Camera history.");
    expect(html).toContain("Generate · check Camera history first");
    expect(html).toContain("Check Camera history before generating again.");
    const { CHECK_FIRST } =
      await import("../src/template-gallery/useMechanicalRun");
    expect(CHECK_FIRST).toBe(
      "A run may be in progress; see Camera history. Generate a new run anyway?",
    );
  });
});

describe("Tab in the drawer", () => {
  it("cycles the drawer, then the live header, and back", async () => {
    const { nextInRing } = await import("../src/template-gallery/focus-ring");
    const [a, b, bubble] = ["a", "b", "bubble"].map(
      (id) => ({ id }) as unknown as HTMLElement,
    );
    const ring = [a, b, bubble];
    expect(nextInRing(ring, b, false)).toBe(bubble);
    expect(nextInRing(ring, bubble, false)).toBe(a);
    expect(nextInRing(ring, a, true)).toBe(bubble);
    // Focus outside the ring keeps the browser's own order.
    expect(nextInRing(ring, null, false)).toBeUndefined();
  });
});
