// The Editor's Regenerate: a running session is never interrupted, the
// agent is set up before the save, the project copy must then hold the
// person's last edit (a refusal says why), the last session on this
// project makes it a next turn and anything else a new session, and the
// spawn's refusal is shown once, never retried. Nothing here submits a
// generation: against a fake local server the only write is the session
// start, with the project linked.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../shared/agent-session";
import { base } from "./house-template-fixtures";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const session = (patch: Partial<AgentSession> = {}): AgentSession => ({
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "running",
  prompt: "Regenerate",
  startedAt: "2026-10-27T12:00:00.000Z",
  lines: [],
  ...patch,
});
const DONE = session({
  id: "22222222-2222-4222-8222-222222222222",
  status: "done",
  summary: "Cut four shots to the grid.",
});

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

async function load() {
  const module = await import("../src/director/regenerate");
  const bundle = base();
  /** The prompts each start wrote, once the agent was ready. */
  const written: string[] = [];
  const spawn = vi.fn(
    async (request: {
      prompt: string;
      writePrompt?: () => Promise<string>;
    }) => {
      written.push(
        request.writePrompt ? await request.writePrompt() : request.prompt,
      );
      return session();
    },
  );
  const save = vi.fn(async () => ({ saved: true as const }));
  const show = vi.fn();
  return {
    ...module,
    bundle,
    spawn,
    save,
    show,
    written,
    deps: (patch: Record<string, unknown> = {}) => ({
      bundle: () => bundle,
      save,
      spawn,
      show,
      latest: () => undefined,
      startedOn: () => undefined,
      copy: async () => true,
      inFlight: () => false,
      ...patch,
    }),
  };
}

describe("regenerate", () => {
  it("gets the agent ready, then saves the copy, then writes the prompt", async () => {
    const { regenerate, deps, save, spawn, written, SAVE_WAIT_MS } =
      await load();
    const outcome = await regenerate("Use my new order", deps());
    expect(save).toHaveBeenCalledWith(SAVE_WAIT_MS);
    // The save runs inside the spawn, once setup is done (writePrompt).
    expect(spawn.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[0],
    );
    expect(spawn).toHaveBeenCalledTimes(1);
    const [request] = spawn.mock.calls[0] as unknown as [
      { source: string; writePrompt?: unknown },
    ];
    expect(request.source).toBe("typed");
    expect(request.writePrompt).toBeTypeOf("function");
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("Use my new order");
    expect(written[0]).toContain("Regenerate the linked Director project");
    expect(written[0]).not.toContain("next turn");
    expect(outcome).toMatchObject({ kind: "sent", turn: "new" });
  });

  it("is the next turn when the last session was on this project", async () => {
    const { regenerate, deps, written } = await load();
    const outcome = await regenerate(
      "Slower",
      deps({ latest: () => DONE, startedOn: () => "signal-studies" }),
    );
    expect(written[0]).toContain(
      "the previous session ended done. Its summary: Cut four shots to the grid.",
    );
    expect(outcome).toMatchObject({ kind: "sent", turn: "next" });
  });

  it("is a new session when the last one was on another project", async () => {
    const { regenerate, deps, written } = await load();
    const outcome = await regenerate(
      "Slower",
      deps({ latest: () => DONE, startedOn: () => "other-project" }),
    );
    expect(written[0]).not.toContain("next turn");
    expect(outcome).toMatchObject({ turn: "new" });
  });

  it("leaves a running session alone and shows it", async () => {
    const { regenerate, deps, save, spawn, show } = await load();
    const running = session();
    const outcome = await regenerate("Again", deps({ latest: () => running }));
    expect(outcome).toEqual({ kind: "busy", session: running });
    expect(show).toHaveBeenCalledWith(running);
    expect(save).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("sends nothing when the copy does not take the last edit, and says why", async () => {
    const { regenerate, deps, written } = await load();
    for (const problem of [
      { kind: "slow" as const },
      { kind: "refused" as const, message: "Invalid bundle" },
      { kind: "none" as const },
    ]) {
      const outcome = await regenerate(
        "Again",
        deps({ save: vi.fn(async () => ({ saved: false, problem })) }),
      );
      expect(outcome).toEqual({ kind: "unsaved", problem });
    }
    expect(written).toEqual([]);
  });

  it("puts the agent's setup before the save: a closed setup saves nothing", async () => {
    const { regenerate, deps, save } = await load();
    // The spawn dialog closed while choosing an agent: writePrompt never ran.
    const closed = vi.fn(async () => undefined);
    expect(await regenerate("Again", deps({ spawn: closed }))).toEqual({
      kind: "closed",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("never joins a start already under way, and keeps the words", async () => {
    const { regenerate, deps, save, spawn } = await load();
    expect(await regenerate("Again", deps({ inFlight: () => true }))).toEqual({
      kind: "starting",
    });
    expect(save).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("tells a studio without a project copy apart from a slow save", async () => {
    const { regenerate, deps, save, spawn } = await load();
    expect(
      await regenerate("Again", deps({ copy: async () => false })),
    ).toEqual({ kind: "no-copy" });
    expect(save).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("refuses an empty instruction before saving", async () => {
    const { regenerate, deps, save, spawn } = await load();
    await expect(regenerate("  \n", deps())).rejects.toThrow(
      "Say what should change.",
    );
    expect(save).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("passes on a refusal once and a closed dialog as nothing started", async () => {
    const { regenerate, deps } = await load();
    const refused = vi.fn(async () => {
      throw new Error("No agent is saved on this server yet.");
    });
    await expect(regenerate("Again", deps({ spawn: refused }))).rejects.toThrow(
      "No agent is saved on this server yet.",
    );
    expect(refused).toHaveBeenCalledTimes(1);
    const closed = vi.fn(async () => undefined);
    expect(await regenerate("Again", deps({ spawn: closed }))).toEqual({
      kind: "closed",
    });
  });
});

describe("against a fake local server", () => {
  /** Holds the start route's answer, as a slow start would. */
  let hold: Promise<void> | undefined;
  const COPY = "signal-studies.abcdefghjk";
  const server = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/agent/status")
      return json({ available: true, runner: "claude" });
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
        projects: [{ id: "signal-studies", access: "owner", copyId: COPY }],
      });
    if (url === "/api/agent/sessions" && method === "POST") {
      await hold;
      return json(session(), 201);
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  });

  it("starts one session with the project linked and submits no generation", async () => {
    hold = undefined;
    server.mockClear();
    vi.stubGlobal("fetch", server);
    const { studioStore } = await import("../src/studio/store");
    studioStore.getState().actions.initialize(base());
    const guard = await import("../src/director/leave-guard");
    guard.flushBeforeLeaving(async () => true);
    const { regenerate } = await import("../src/director/regenerate");
    const outcome = await regenerate("Keep my trims, redo the title");
    expect(outcome).toMatchObject({ kind: "sent", turn: "new" });
    const writes = server.mock.calls.filter(
      ([, init]) => (init?.method ?? "GET") !== "GET",
    );
    expect(writes.map(([url]) => url)).toEqual(["/api/agent/sessions"]);
    const body = JSON.parse(String(writes[0][1]!.body));
    expect(body).toMatchObject({ copyId: COPY, source: "typed" });
    expect(body.mode).toBeUndefined();
    expect(body.prompt).toContain("Keep my trims, redo the title");
    expect(
      server.mock.calls.some(([url]) => /\/api\/(jobs|chains|quote)/.test(url)),
    ).toBe(false);
    const { shownAgentSession } = await import("../src/agent/useAgentSession");
    expect(shownAgentSession()?.id).toBe(session().id);
    // A second Regenerate on the same project is its next turn.
    const spawnStore = await import("../src/agent/spawn-store");
    expect(spawnStore.sessionProject(session().id)).toBe("signal-studies");
  });
});

describe("a start cancelled while it was under way", () => {
  it("is not joined by Send, and is not reported as started", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const prompts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/agent/status")
          return json({ available: true, runner: "claude" });
        if (url === "/api/settings/agent-runner")
          return json({ saved: { runner: "claude" }, environment: false });
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
        if (url === "/api/projects") return json({ projects: [] });
        if (url === "/api/agent/sessions" && init?.method === "POST") {
          prompts.push(JSON.parse(String(init.body)).prompt);
          await held;
          return json(session(), 201);
        }
        throw new Error(`Unexpected request ${url}`);
      }),
    );
    const { studioStore } = await import("../src/studio/store");
    studioStore.getState().actions.initialize(base());
    const guard = await import("../src/director/leave-guard");
    guard.flushBeforeLeaving(async () => true);
    const store = await import("../src/agent/spawn-store");
    // The bubble's start, closed by the person while its request is out.
    const bubble = store.spawnFromStudio({
      prompt: "Start Genobi",
      source: "typed",
    });
    await vi.waitFor(() => expect(prompts).toEqual(["Start Genobi"]));
    store.cancelSpawn();
    expect(store.spawnInFlight()).toBe(true);
    const { regenerate } = await import("../src/director/regenerate");
    expect(await regenerate("Use my new order")).toEqual({ kind: "starting" });
    release();
    expect(await bubble).toBeUndefined();
    expect(store.spawnInFlight()).toBe(false);
    // Only the bubble's words went out; the instruction was never sent.
    expect(prompts).toEqual(["Start Genobi"]);
  });
});

describe("the Editor's header", () => {
  it("puts Regenerate beside Render MP4 in the Editor only", async () => {
    const { default: ComposerHeader } =
      await import("../src/director/ComposerHeader");
    const props = {
      busy: false,
      transportBusy: false,
      open: () => {},
      save: () => {},
      render: () => {},
    };
    const editor = renderToStaticMarkup(<ComposerHeader {...props} />);
    expect(editor).toMatch(
      /Render MP4 ↗<\/button><div class="dir-regenerate">/,
    );
    expect(editor).toContain('aria-expanded="false"');
    const director = renderToStaticMarkup(<ComposerHeader {...props} simple />);
    expect(director).not.toContain("Regenerate");
  });

  it("places the field under its button, inside the window", async () => {
    const { popoverPlace } = await import("../src/director/RegenerateAction");
    expect(popoverPlace({ right: 1100, bottom: 110 }, 1440, 900)).toEqual({
      position: "fixed",
      top: 116,
      left: 740,
      width: 360,
      maxHeight: 768,
    });
    // A phone: the button wraps to the left; the field spans the window.
    expect(popoverPlace({ right: 110, bottom: 380 }, 320, 640)).toMatchObject({
      left: 16,
      width: 288,
    });
  });

  it("says where the session went and why nothing was sent", async () => {
    const { outcomeNote } = await import("../src/director/RegenerateAction");
    const { BUSY, NO_COPY, STARTING, unsavedText } =
      await import("../src/director/regenerate");
    expect(
      outcomeNote({ kind: "sent", session: session(), turn: "next" })?.text,
    ).toMatch(/^Sent to Claude Code as the next turn on this project/);
    expect(
      outcomeNote({ kind: "sent", session: session(), turn: "new" })?.text,
    ).toMatch(/^Claude Code started on this project/);
    expect(outcomeNote({ kind: "busy", session: session() })).toEqual({
      text: BUSY,
      alert: true,
    });
    expect(outcomeNote({ kind: "starting" })).toEqual({
      text: STARTING,
      alert: true,
    });
    expect(outcomeNote({ kind: "no-copy" })).toEqual({
      text: NO_COPY,
      alert: true,
    });
    expect(outcomeNote({ kind: "starting" })?.text).not.toMatch(
      /started on this project|with your instruction/,
    );
    expect(outcomeNote({ kind: "unsaved", problem: { kind: "slow" } })).toEqual(
      { text: unsavedText({ kind: "slow" }), alert: true },
    );
    // A refusal is not a slow save: it names the server's reason.
    const refused = outcomeNote({
      kind: "unsaved",
      problem: { kind: "refused", message: "Invalid bundle" },
    })!.text;
    expect(refused).toContain("refused your latest edit");
    expect(refused).toContain("Invalid bundle");
    expect(refused).not.toMatch(/in time|still saving/);
    for (const kind of ["unreachable", "replaced", "none", "slow"] as const)
      expect(unsavedText({ kind })).toContain("your words stay here");
    expect(outcomeNote({ kind: "closed" })).toBeUndefined();
  });
});
