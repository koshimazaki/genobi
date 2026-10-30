import { describe, expect, it, vi } from "vitest";
import { AGENT_PROMPT_MAX, type AgentSession } from "../shared/agent-session";
import { applyScrollCommand, createScroll } from "../shared/scrolls/commands";
import { fillMessage } from "../shared/scrolls/fill";
import { parseScroll } from "../shared/scrolls/types";
import {
  FINISHED,
  applyPanels,
  askToFill,
  collectFill,
  fillExamples,
  pollFill,
} from "../src/scrolls/agent-fill";
import { setDirectorPrompt } from "../src/scrolls/director-prompt";
import { readBrief } from "../src/director/prompt-brief";
import { undoSend } from "../src/studio/send-to-director";
import { createStudioStore } from "../src/studio/store";
import { assetFixture } from "./director-asset-fixture";

// Describe the video: the description and example pairs fenced in one
// session prompt within the session limit, one session per Send, the
// agent's panels applied as cell edits; and the Script as the Director's
// prompt, undoable. Agent and spawn are fakes; nothing runs or spends.
const CODE = "0123456789abcdef0123456789abcdef";
const board = () => {
  const d = createScroll("storyboard", 3, "rooftop");
  d.name = "Rooftop";
  return d;
};

describe("the fill prompt", () => {
  it("fences the description and each example, names the code and the panels", () => {
    const text = fillMessage({
      description: "Two ninjas meet.\n---\nThen one runs.\x07",
      document: board(),
      examples: [
        { name: "Sky Gate", prompt: "A mecha lands." },
        { name: "Raw" },
      ],
      code: CODE,
    });
    expect(text).toContain("---\nTwo ninjas meet.\n(---)\nThen one runs.\n---");
    expect(text).toContain("cell-1, cell-2, cell-3");
    expect(text).toContain(`genobi_scrolls_panels once with code ${CODE}`);
    expect(text).toMatch(/Example pair 1, "Sky Gate"[\s\S]*A mecha lands\./);
    expect(text).toContain("No prompt recorded for this reference.");
    expect(text).toMatch(/Do not quote or generate/);
  });

  it("stays within the session's prompt limit, whatever the scroll holds", () => {
    let d = createScroll("storyboard", 16, "long");
    for (const c of d.cells)
      d = applyScrollCommand(d, {
        op: "cell",
        revision: d.revision,
        cell: {
          ...c,
          title: "t".repeat(80),
          camera: "c".repeat(300),
          action: "a".repeat(300),
          prompt: "p".repeat(1500),
        },
      });
    const text = fillMessage({
      description: "d".repeat(5000),
      document: d,
      examples: Array.from({ length: 5 }, (_, i) => ({
        name: `Example ${i}`,
        prompt: "e".repeat(4000),
        shots: [["Shot", "Locked", "Hold"]] as const,
      })),
      code: CODE,
    });
    expect(text.length).toBeLessThanOrEqual(AGENT_PROMPT_MAX);
    expect(text).toContain(`code ${CODE}`);
    expect(text).toContain(d.cells.map((c) => c.id).join(", "));
  });

  it("refuses an empty description or a malformed code", () => {
    const input = { document: board(), examples: [], code: CODE };
    expect(() => fillMessage({ ...input, description: " \n " })).toThrow(
      /Describe/,
    );
    expect(() =>
      fillMessage({ ...input, description: "x", code: "nope" }),
    ).toThrow(/code/);
  });

  it("shows a catalogue plan when no reference recorded a prompt", () => {
    const examples = fillExamples(board(), []);
    expect(examples).toHaveLength(1);
    expect(examples[0].shots?.length).toBeGreaterThan(0);
    expect(
      fillExamples(board(), [
        {
          id: "a",
          name: "Mine.png",
          role: "style",
          kind: "image",
          origin: "generated",
          file: { path: "media/a.png", sha256: "0".repeat(64) },
          prompt: "My sheet",
        },
      ]),
    ).toEqual([{ name: "Mine.png", prompt: "My sheet" }]);
  });
});

describe("Send", () => {
  const session = { id: "s1", status: "running" } as AgentSession;
  const ok = () =>
    vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "req-1", code: CODE }), {
          headers: { "Content-Type": "application/json" },
        }),
    );

  it("starts one session with the code in its prompt", async () => {
    const fetch = ok();
    const spawn = vi.fn(async () => session);
    const outcome = await askToFill("Two ninjas meet.", board(), [], {
      fetch,
      spawn,
      inFlight: () => false,
      latest: () => undefined,
    });
    expect(outcome).toEqual({ kind: "sent", session, requestId: "req-1" });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [{ prompt }] = spawn.mock.calls[0] as unknown as [{ prompt: string }];
    expect(prompt).toContain(CODE);
    expect(JSON.parse(String(fetch.mock.calls[0][1]!.body))).toEqual({
      documentId: "rooftop",
      cellIds: ["cell-1", "cell-2", "cell-3"],
    });
  });

  it("starts nothing while a session runs or another start is under way", async () => {
    const fetch = ok();
    const spawn = vi.fn();
    const show = vi.fn();
    const deps = { fetch, spawn, show };
    expect(
      await askToFill("x", board(), [], {
        ...deps,
        inFlight: () => false,
        latest: () => session,
      }),
    ).toEqual({ kind: "busy", session });
    expect(show).toHaveBeenCalledWith(session);
    expect(
      await askToFill("x", board(), [], {
        ...deps,
        inFlight: () => true,
        latest: () => undefined,
      }),
    ).toEqual({ kind: "starting" });
    await expect(
      askToFill("  ", board(), [], { ...deps, latest: () => undefined }),
    ).rejects.toThrow(/Describe/);
    expect(fetch).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("says the hosted studio has no hand-off, and starts nothing", async () => {
    const spawn = vi.fn();
    const outcome = await askToFill("x", board(), [], {
      fetch: vi.fn(async () =>
        Response.json({ error: "Not found" }, { status: 404 }),
      ),
      spawn,
      inFlight: () => false,
      latest: () => undefined,
    });
    expect(outcome).toEqual({ kind: "local-only" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("reads an expired request as gone", async () => {
    expect(
      await collectFill(
        "req-1",
        vi.fn(async () => new Response("{}", { status: 404 })),
      ),
    ).toBe("gone");
  });
});

describe("the agent's panels", () => {
  it("merge into each cell as it is now and skip a cell removed since", () => {
    const d = board();
    d.cells[0].durationFrames = 48;
    const { document, filled } = applyPanels(parseScroll(d), [
      { cellId: "cell-1", title: "Standoff", camera: "Locked" },
      { cellId: "cell-9", title: "Gone" },
    ]);
    expect(filled).toBe(1);
    expect(document.cells[0]).toMatchObject({
      title: "Standoff",
      camera: "Locked",
      durationFrames: 48,
    });
    expect(document.revision).toBe(d.revision + 1);
  });
});

describe("the Script", () => {
  it("is kept in the scroll through its brief command", () => {
    const d = applyScrollCommand(board(), {
      op: "brief",
      revision: 0,
      script: "They meet.\nThey run.",
    });
    expect(parseScroll(d).script).toBe("They meet.\nThey run.");
    expect(() =>
      applyScrollCommand(d, { op: "brief", revision: 1, script: "bell\x07" }),
    ).toThrow(/control characters/);
  });

  it("becomes the Director's prompt, says a repeat, and undoes", () => {
    const store = createStudioStore();
    store.getState().actions.initialize(assetFixture());
    const before = readBrief(store.getState().director.bundle!).text;
    const set = setDirectorPrompt("  Two ninjas escape.  ", store);
    expect(set.message).toBe("Set as the Director's prompt.");
    expect(readBrief(store.getState().director.bundle!).text).toBe(
      "Two ninjas escape.",
    );
    expect(setDirectorPrompt("Two ninjas escape.", store)).toEqual({
      message: "Already the Director's prompt.",
    });
    expect(undoSend(set, store)).toBe(true);
    expect(readBrief(store.getState().director.bundle!).text).toBe(before);
    expect(() => setDirectorPrompt(" ", store)).toThrow(/script first/);
  });
});

describe("a long script as the description", () => {
  it("says it was cut, not verbatim, and sends only the first 1,500 characters", () => {
    const script = `${"a".repeat(1500)}TAIL`;
    const cut = fillMessage({
      description: script,
      document: board(),
      examples: [],
      code: CODE,
    });
    expect(cut).toContain(
      "Their description, cut to its first 1,500 characters, between",
    );
    expect(cut).not.toContain("verbatim, between");
    expect(cut).not.toContain("TAIL");
    const whole = fillMessage({
      description: "a".repeat(1500),
      document: board(),
      examples: [],
      code: CODE,
    });
    expect(whole).toContain("Their description, verbatim, between");
  });
});

describe("waiting for the panels", () => {
  const ended = async () => ({ status: "done" }) as AgentSession;
  const running = async () => ({ status: "running" }) as AgentSession;
  const panels = [{ cellId: "cell-1", title: "Standoff" }];

  it("keeps waiting while the session runs", async () => {
    expect(
      await pollFill("req-1", "s1", {
        collect: async () => null,
        session: running,
      }),
    ).toEqual({ kind: "waiting" });
  });

  it("stops when the session ended without panels", async () => {
    const collect = vi.fn(async () => null);
    expect(await pollFill("req-1", "s1", { collect, session: ended })).toEqual({
      kind: "finished",
    });
    // One last read after the end, in case they came just before it.
    expect(collect).toHaveBeenCalledTimes(2);
    expect(FINISHED).toBe("Genobi finished without sending panels.");
  });

  it("still collects panels sent just before the session ended", async () => {
    const collect = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ documentId: "rooftop", panels });
    expect(await pollFill("req-1", "s1", { collect, session: ended })).toEqual({
      kind: "panels",
      documentId: "rooftop",
      panels,
    });
  });

  it("reads an expired request as gone without asking the session", async () => {
    const session = vi.fn(running);
    expect(
      await pollFill("req-1", "s1", { collect: async () => "gone", session }),
    ).toEqual({ kind: "gone" });
    expect(session).not.toHaveBeenCalled();
  });
});
