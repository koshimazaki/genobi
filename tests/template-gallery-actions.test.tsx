// Box 2.2 (Box 1.6 decision 5): the gallery drawer starts the session.
// Generate now opens the template with the person's references and starts
// the agent through the one spawn action, with the open project linked and
// the skill and intake as its first turn; Take it to Director is today's
// address; Take it to the editor opens the session's project in the Editor.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { animeTeaser, productVideo } from "../shared/templates/catalogue";
import type { TemplatePicks } from "../src/template-gallery/open-template";
import { platePng } from "../src/director/plate";
import { base, samples } from "./house-template-fixtures";

// Each test re-imports the studio after resetModules and digests the
// multi-megabyte Scrolls examples, which can pass 5 s on a loaded machine.
vi.setConfig({ testTimeout: 20_000 });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const COPY = "anime-teaser.abcdefghjk";
const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "running",
  prompt: "Run the anime-teaser skill",
  startedAt: "2026-10-27T12:00:00.000Z",
  lines: [],
};
/** A local server with Claude Code saved and signed in, and the copy. */
const server = vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  if (url === "/api/agent/status")
    return json({ available: true, runner: "claude", terminal: false });
  if (url === "/api/settings/agent-runner")
    return json({
      saved: { runner: "claude" },
      environment: false,
      hermesProvider: true,
    });
  if (url === "/api/agent/sign-in")
    return json({
      harnesses: [
        {
          runner: "claude",
          name: "Claude Code",
          installed: true,
          signedIn: true,
        },
      ],
    });
  if (url === "/api/projects")
    return json({
      projects: [{ id: "anime-teaser", access: "owner", copyId: COPY }],
    });
  if (url === "/api/agent/sessions" && method === "POST")
    return json(SESSION, 201);
  throw new Error(`Unexpected request ${method} ${url}`);
});
const started = () =>
  server.mock.calls
    .filter(([url]) => url === "/api/agent/sessions")
    .map(([, init]) => JSON.parse(String(init!.body)));

/** The person kept the example sheet, dropped a storyboard, left the track. */
const chosen: TemplatePicks = {
  picks: { track: "missing", character: "example", storyboard: "yours" },
  dropped: {
    storyboard: [
      {
        bytes: platePng(256, 144, "#101010", "#f0f0f0"),
        ext: "png",
        origin: "uploaded",
      },
    ],
  },
};

beforeEach(() => {
  vi.resetModules();
  server.mockClear();
  vi.stubGlobal("fetch", server);
});
afterEach(() => vi.unstubAllGlobals());

describe("Generate now", () => {
  it("opens the template with the references, then spawns the agent on it", async () => {
    const { studioStore } = await import("../src/studio/store");
    const { buildTemplateBundle, pickReferences } =
      await import("../src/director/house-template");
    const { generateNow } =
      await import("../src/template-gallery/template-actions");
    const order: string[] = [];
    // The real open builds from the Vite sample URLs; this one builds from
    // the same files on disk and commits the same way.
    const open = vi.fn(async (id: string, picks?: TemplatePicks) => {
      order.push(`open ${id}`);
      const bundle = await buildTemplateBundle(
        base(),
        animeTeaser,
        {},
        pickReferences(
          animeTeaser,
          picks!.picks,
          samples(animeTeaser),
          picks!.dropped,
        ),
      );
      studioStore.getState().actions.commit(bundle);
    });
    const save = vi.fn(async () => {
      order.push("save");
      return true;
    });
    const outcome = await generateNow(animeTeaser, chosen, { open, save });
    expect(order).toEqual(["open anime-teaser", "save"]);
    expect(open).toHaveBeenCalledWith("anime-teaser", chosen);
    expect(outcome).toEqual({ session: SESSION });

    // The spawn action started one session, the project linked.
    const [request] = started();
    expect(started()).toHaveLength(1);
    expect(request).toMatchObject({ source: "typed", copyId: COPY });
    expect(request.prompt).toContain('genobi_skill with name "anime-teaser"');
    expect(request.prompt).toContain("Mine: Storyboard.");
    expect(request.prompt).toContain(
      '"Do you have a track, or shall I generate one?"',
    );

    // The dropped storyboard and the example sheet are project assets; the
    // missing track is not, so the agent asks for it.
    const project = studioStore.getState().director.bundle!.project;
    expect(project.assets["storyboard-1"]).toMatchObject({
      kind: "image",
      use: "reference",
      origin: "uploaded",
    });
    expect(project.assets["character-1"]).toMatchObject({ origin: "fixture" });
    expect(project.assets["track-1"]).toBeUndefined();
  });

  it("starts nothing when the project copy did not save", async () => {
    const { generateNow, COPY_NOT_SAVED } =
      await import("../src/template-gallery/template-actions");
    const open = vi.fn(async () => {});
    const save = vi.fn(async () => false);
    const spawn = vi.fn();
    await expect(
      generateNow(animeTeaser, chosen, { open, save, spawn }),
    ).rejects.toThrow(COPY_NOT_SAVED);
    expect(COPY_NOT_SAVED).toBe("The project copy did not save; try again.");
    expect(open).toHaveBeenCalledOnce();
    expect(spawn).not.toHaveBeenCalled();
    expect(started()).toEqual([]);
  });

  it("asks before replacing a session's project or edits", async () => {
    const { replacesWork, replaceQuestion } =
      await import("../src/template-gallery/template-actions");
    const { buildTemplateBundle } =
      await import("../src/director/house-template");
    const bundle = await buildTemplateBundle(
      base(),
      animeTeaser,
      {},
      samples(animeTeaser),
    );
    const fresh = { bundle, history: [], drafts: {} };
    // A fresh open project with no session: nothing to lose.
    expect(replacesWork(fresh, "anime-teaser", false)).toBe(false);
    // A session works on it, or it holds edits: ask.
    expect(replacesWork(fresh, "anime-teaser", true)).toBe(true);
    expect(
      replacesWork({ ...fresh, history: [bundle] }, "anime-teaser", false),
    ).toBe(true);
    // Another project open, this one kept as an edited draft: ask.
    const other = { ...bundle, project: { ...bundle.project, id: "other" } };
    expect(
      replacesWork(
        {
          bundle: other,
          history: [],
          drafts: { "anime-teaser": { bundle, history: [bundle] } },
        },
        "anime-teaser",
        false,
      ),
    ).toBe(true);
    // Nothing of this template open or kept: nothing to replace.
    expect(
      replacesWork(
        { bundle: other, history: [other], drafts: {} },
        "anime-teaser",
        true,
      ),
    ).toBe(false);
    expect(replaceQuestion("Anime teaser")).toContain(
      "an agent's cut included",
    );
  });

  it("refuses picks the template cannot take before anything opens", async () => {
    const { generateNow } =
      await import("../src/template-gallery/template-actions");
    const open = vi.fn();
    const spawn = vi.fn();
    await expect(
      generateNow(
        animeTeaser,
        { picks: { voice: "yours" }, dropped: {} },
        { open, spawn },
      ),
    ).rejects.toThrow("has no reference voice");
    expect(open).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe("Take it to Director and to the editor", () => {
  it("is today's address, with the references only when changed", async () => {
    const { takeToDirector, takeToEditor } =
      await import("../src/template-gallery/template-actions");
    const open = vi.fn(async () => {});
    const navigate = vi.fn();
    const examples: TemplatePicks = {
      picks: { track: "example", character: "example", storyboard: "example" },
      dropped: {},
    };
    await takeToDirector(animeTeaser, examples, { open, navigate });
    expect(open).toHaveBeenLastCalledWith("anime-teaser", undefined);
    expect(navigate).toHaveBeenLastCalledWith("/director?example=anime-teaser");
    await takeToDirector(animeTeaser, chosen, { open, navigate });
    expect(open).toHaveBeenLastCalledWith("anime-teaser", chosen);
    await takeToEditor(animeTeaser, { open, navigate });
    expect(open).toHaveBeenLastCalledWith("anime-teaser", undefined);
    expect(navigate).toHaveBeenLastCalledWith(
      "/director?example=anime-teaser&workspace=editor",
    );
  });
});

describe("the drawer", () => {
  const render = async (session: boolean, template = animeTeaser) => {
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

  it("shows one drop zone per reference, at its example, and the two actions", async () => {
    const html = await render(false);
    for (const id of ["character", "storyboard"])
      expect(html).toContain(`data-reference="${id}" data-state="example"`);
    // The track Genobi can make starts missing, so the intake asks for it.
    expect(html).toContain('data-reference="track" data-state="missing"');
    expect(html).toContain('src="/scrolls/character.png"');
    expect(html).toContain('src="/scrolls/storyboard.png"');
    expect(html).toContain('aria-label="Drop your track"');
    expect(html).toContain('accept="audio/wav,audio/mpeg,.wav,.mp3"');
    expect(html).toContain('aria-label="Generate the storyboard"');
    expect(html).toContain("Generate now");
    expect(html).toContain('href="/director?example=anime-teaser"');
    expect(html).toContain("Take it to Director");
    expect(html).not.toContain("Take it to the editor");
  });

  it("offers Take it to the editor once a session exists", async () => {
    const html = await render(true);
    expect(html).toContain(
      'href="/director?example=anime-teaser&amp;workspace=editor"',
    );
    expect(html).toContain("Take it to the editor");
  });

  it("gives the other templates the same zones", async () => {
    const html = await render(false, productVideo);
    expect(html).toContain('data-reference="product" data-state="missing"');
    expect(html).toContain('aria-label="Drop your product photos"');
    expect(html).toContain("multiple");
    // Nothing makes product photos, so there is nothing to generate.
    expect(html).not.toContain("Generate the product photos");
  });
});

describe("a zone's file and words", () => {
  const [track, sheet] = animeTeaser.references;
  /** A File whose bytes must not be read. */
  const unread = (size: number, name: string) => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    return {
      file: { size, name, arrayBuffer } as unknown as File,
      arrayBuffer,
    };
  };

  it("refuses a file over the limit before reading a byte", async () => {
    const { readDropped } =
      await import("../src/template-gallery/TemplateIntake");
    const big = unread(5 * 1024 * 1024 + 1, "huge.png");
    await expect(readDropped(sheet, [big.file])).rejects.toMatchObject({
      short: "Too large",
      message: "Character sheet: huge.png is over 5 MB.",
    });
    expect(big.arrayBuffer).not.toHaveBeenCalled();
    const song = unread(50_000_001, "long.mp3");
    await expect(readDropped(track, [song.file])).rejects.toMatchObject({
      short: "Too large",
    });
    expect(song.arrayBuffer).not.toHaveBeenCalled();
  });

  it("gives a short refusal for the zone and the sentence for the drawer", async () => {
    const { readDropped } =
      await import("../src/template-gallery/TemplateIntake");
    const text = new File(["not an image"], "notes.txt");
    await expect(readDropped(sheet, [text])).rejects.toMatchObject({
      short: "Use PNG, JPEG or WebP",
      message: "Character sheet: use a PNG, JPEG or WebP image.",
    });
    await expect(readDropped(track, [text])).rejects.toMatchObject({
      short: "Use WAV or MP3",
    });
  });

  it("names MiniMax-Music3 where the track is generated, as its licence asks", async () => {
    const { caption } = await import("../src/template-gallery/TemplateIntake");
    expect(caption(track, "missing")).toBe(
      "Generate · MiniMax-Music3 · MiniMax Music 3 ×4",
    );
    expect(caption(sheet, "missing")).toBe("Generate · FLUX 3");
  });
});
