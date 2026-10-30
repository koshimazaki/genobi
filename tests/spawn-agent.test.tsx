// Box 1.6: one "Spawn agent" action wherever the studio has no agent. Against
// a fake local server: choose and save a harness, set Hermes up, open its
// sign-in and wait for Check sign-in again, then start the session with the
// open project linked, in Terminal or the bubble.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunnerStatus } from "../shared/agent-session";
import type { HarnessSignIn } from "../shared/agent-runner-setting";
import { base } from "./house-template-fixtures";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "hermes",
  status: "running",
  prompt: "Cut the drop",
  startedAt: "2026-10-27T12:00:00.000Z",
  lines: [],
};
const COPY = "studio-house.abcdefghjk";

/** The owner's Terminal session from before a reload. */
const RUNNING = {
  ...SESSION,
  id: "22222222-2222-4222-8222-222222222222",
};
/** What the start route answers. */
let answer: { status: number; body: unknown };
let saved: Record<string, string | null>;
let local: boolean;
/** Holds the project copy lookup, as a slow answer would. */
let projects: Promise<void> | undefined;
let profile: boolean;
let signedIn: boolean;
let claudeSignedIn: boolean;
const status = (): AgentRunnerStatus =>
  !saved.runner
    ? { available: false, message: "No agent is set up on this server." }
    : profile
      ? {
          available: false,
          runner: "hermes",
          message: "Hermes' genobi profile is missing.",
          setup: "hermes-profile",
        }
      : { available: true, runner: saved.runner as "hermes", terminal: true };
const rows = (): HarnessSignIn[] => [
  {
    runner: "claude",
    name: "Claude Code",
    installed: true,
    signedIn: claudeSignedIn,
  },
  { runner: "hermes", name: "Hermes", installed: true, signedIn },
  { runner: "codex", name: "Codex", installed: false, signedIn: false },
];
const server = vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  if (url === "/api/settings/run-location")
    return json({
      revision: 0,
      location: "cloud",
      choices: ["cloud"],
      fixed: !local,
    });
  if (url === "/api/agent/status") return json(status());
  if (url === "/api/settings/agent-runner") {
    if (!local) return json({ error: "API route not found." }, 404);
    if (method === "POST") saved = JSON.parse(String(init!.body));
    return json({ saved, environment: false, hermesProvider: true });
  }
  if (url === "/api/agent/sign-in") return json({ harnesses: rows() });
  if (
    url === "/api/agent/sign-in/hermes" ||
    url === "/api/agent/sign-in/claude"
  )
    return json({ opened: true }, 201);
  if (url === "/api/agent/hermes-profile" && method === "POST") {
    profile = false;
    return json(
      { phase: "done", steps: { check: "done" }, created: true },
      202,
    );
  }
  if (url === "/api/projects") {
    await projects;
    return json({
      projects: [{ id: "studio-house", access: "owner", copyId: COPY }],
    });
  }
  if (url === "/api/agent/sessions" && method === "POST")
    return json(answer.body, answer.status);
  if (url === `/api/agent/sessions/${RUNNING.id}`) return json(RUNNING);
  throw new Error(`Unexpected request ${method} ${url}`);
});
const calls = () =>
  server.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);
const started = () =>
  server.mock.calls
    .filter(([url]) => url === "/api/agent/sessions")
    .map(([, init]) => JSON.parse(String(init!.body)));

beforeEach(() => {
  vi.resetModules();
  saved = { runner: null };
  local = true;
  projects = undefined;
  profile = false;
  signedIn = true;
  claudeSignedIn = true;
  answer = { status: 201, body: SESSION };
  server.mockClear();
  vi.stubGlobal("fetch", server);
});
afterEach(() => vi.unstubAllGlobals());

describe("a start that does not start", () => {
  it("follows the owner's running session when the server says busy", async () => {
    saved = { runner: "claude" };
    answer = {
      status: 409,
      body: {
        error: "An agent session is already running.",
        code: "agent_busy",
        sessionId: RUNNING.id,
      },
    };
    const { spawnAgent, ALREADY_RUNNING } = await import("../src/agent/spawn");
    const shown = await import("../src/agent/useAgentSession");
    await expect(
      spawnAgent(request, { mode: () => "terminal" }),
    ).rejects.toThrow(ALREADY_RUNNING);
    expect(shown.shownAgentSession()?.id).toBe(RUNNING.id);
  });

  it("is never reported as started when the runner failed", async () => {
    saved = { runner: "claude" };
    answer = {
      status: 201,
      body: {
        ...SESSION,
        status: "failed",
        summary: "Claude Code could not start.",
      },
    };
    const { spawnAgent } = await import("../src/agent/spawn");
    const shown = await import("../src/agent/useAgentSession");
    const phases: string[] = [];
    await expect(
      spawnAgent(request, {
        phase: (phase) => void phases.push(phase),
        mode: () => "headless",
      }),
    ).rejects.toThrow("Claude Code could not start.");
    expect(phases).not.toContain("started");
    expect(shown.shownAgentSession()).toBeUndefined();
  });

  it("the dialog's × between questions stops the spawn before it starts", async () => {
    saved = { runner: "claude" };
    const store = await import("../src/agent/spawn-store");
    // Closed while the status is still being read: no question is waiting.
    const spawning = store.spawnFromStudio({ prompt: "Go", source: "typed" });
    store.cancelSpawn();
    expect(await spawning).toBeUndefined();
    expect(store.spawnStep().kind).toBe("closed");
    expect(started()).toEqual([]);
  });

  it("closed during Starting Genobi…, the session never starts", async () => {
    saved = { runner: "claude" };
    let release = () => {};
    projects = new Promise<void>((resolve) => (release = resolve));
    // A project is open, so its copy is looked up before the start.
    const { studioStore } = await import("../src/studio/store");
    studioStore.getState().actions.initialize(base());
    const store = await import("../src/agent/spawn-store");
    const spawning = store.spawnFromStudio({ prompt: "Go", source: "typed" });
    await vi.waitFor(() => expect(store.spawnStep().kind).toBe("mode"));
    store.chooseMode("headless");
    await vi.waitFor(() => expect(calls()).toContain("GET /api/projects"));
    expect(store.spawnStep()).toEqual({
      kind: "working",
      text: "Starting Genobi…",
    });
    store.cancelSpawn();
    release();
    expect(await spawning).toBeUndefined();
    expect(started()).toEqual([]);
  });
});

const request = {
  prompt: "Cut the drop",
  source: "voice" as const,
  projectId: "studio-house",
  context: { picks: [] },
};

describe("spawnAgent", () => {
  it("picks, saves, sets Hermes up, signs in, then starts in Terminal on the open project", async () => {
    profile = true;
    signedIn = false;
    const { spawnAgent } = await import("../src/agent/spawn");
    const shown = await import("../src/agent/useAgentSession");
    const offers: unknown[] = [];
    const phases: string[] = [];
    const signIn = vi.fn();
    const session = await spawnAgent(request, {
      choose: async (offer) => {
        offers.push(offer.suggested);
        return { runner: "hermes" };
      },
      phase: (phase) => phases.push(phase),
      signIn,
      mode: () => "terminal",
    });
    // Hermes is installed, so it is the suggestion; the default model saved.
    expect(offers).toEqual(["hermes"]);
    expect(saved).toEqual({
      runner: "hermes",
      hermesModel: "deepseek/deepseek-v4.1-flash",
      hermesProvider: "nous",
    });
    // No separate sign-in window and no Check sign-in again: the session's
    // own window signs in, then chats (Box 1.7).
    expect(signIn).not.toHaveBeenCalled();
    expect(calls()).toEqual([
      "GET /api/agent/status",
      "GET /api/settings/agent-runner",
      "GET /api/agent/sign-in",
      "POST /api/settings/agent-runner",
      "GET /api/agent/status",
      "POST /api/agent/hermes-profile",
      "GET /api/agent/status",
      "GET /api/agent/sign-in",
      "GET /api/settings/run-location",
      "GET /api/projects",
      "POST /api/agent/sessions",
    ]);
    expect(started()).toEqual([
      {
        prompt: "Cut the drop",
        source: "voice",
        context: { picks: [] },
        copyId: COPY,
        mode: "terminal",
        signIn: true,
      },
    ]);
    expect(phases).toContain("terminal-sign-in");
    expect(phases).not.toContain("sign-in");
    expect(session.id).toBe(SESSION.id);
    expect(shown.shownAgentSession()?.id).toBe(SESSION.id);
  });

  it("Hermes in the bubble still opens its sign-in and waits for the check", async () => {
    saved = { runner: "hermes" };
    signedIn = false;
    const { spawnAgent } = await import("../src/agent/spawn");
    await spawnAgent(request, {
      signIn: async (runner) => {
        expect(runner).toBe("hermes");
        signedIn = true;
      },
      mode: () => "headless",
    });
    expect(calls()).toContain("POST /api/agent/sign-in/hermes");
    expect(started()[0]).not.toHaveProperty("mode");
    expect(started()[0]).not.toHaveProperty("signIn");
  });

  it("Claude Code keeps its own sign-in wait, in Terminal too", async () => {
    saved = { runner: "claude" };
    claudeSignedIn = false;
    const { spawnAgent } = await import("../src/agent/spawn");
    const waits: string[] = [];
    await spawnAgent(request, {
      signIn: async (runner) => {
        waits.push(runner);
        claudeSignedIn = true;
      },
      mode: () => "terminal",
    });
    expect(waits).toEqual(["claude"]);
    expect(calls()).toContain("POST /api/agent/sign-in/claude");
    expect(started()[0]).toMatchObject({ mode: "terminal" });
    expect(started()[0]).not.toHaveProperty("signIn");
  });

  it("starts at once with a saved, signed-in harness; the bubble when asked", async () => {
    saved = { runner: "claude" };
    const { spawnAgent } = await import("../src/agent/spawn");
    const choose = vi.fn();
    await spawnAgent(request, { choose, mode: () => "headless" });
    expect(choose).not.toHaveBeenCalled();
    expect(started()[0]).not.toHaveProperty("mode");
  });

  it("a caller that cannot ask refuses with the reason and starts nothing", async () => {
    const { spawnAgent, NO_SAVED_RUNNER } = await import("../src/agent/spawn");
    await expect(spawnAgent(request)).rejects.toThrow(NO_SAVED_RUNNER);
    saved = { runner: "hermes" };
    signedIn = false;
    // In the bubble a signed-out Hermes needs the wait this caller lacks.
    await expect(
      spawnAgent(request, { mode: () => "headless" }),
    ).rejects.toThrow("Hermes is not signed in.");
    expect(started()).toEqual([]);
    // Setup's summary signs in itself: no Terminal that signs in first.
    await expect(
      spawnAgent(request, { mode: () => "terminal", signInThere: false }),
    ).rejects.toThrow("Hermes is not signed in.");
    expect(started()).toEqual([]);
    // In Terminal (the default) its own window signs in, so it starts.
    await spawnAgent(request);
    expect(started()).toEqual([
      expect.objectContaining({ mode: "terminal", signIn: true }),
    ]);
  });

  it("the hosted studio relays to a paired runner in the bubble, unlinked", async () => {
    local = false;
    saved = { runner: "claude" };
    const { spawnAgent } = await import("../src/agent/spawn");
    await spawnAgent({ prompt: "Cut the drop", source: "typed" });
    expect(started()).toEqual([{ prompt: "Cut the drop", source: "typed" }]);
  });
});

describe("the spawn dialog", () => {
  it("offers Hermes when installed, lists Codex as not supported, and keeps Hermes' model", async () => {
    const { RunnerChooser } = await import("../src/agent/SpawnAgentDialog");
    const html = renderToStaticMarkup(
      <RunnerChooser
        offer={{ rows: rows(), suggested: "hermes" }}
        onChoose={() => {}}
      />,
    );
    expect(html).toContain("Installed · suggested");
    expect(html).toContain(
      "Not supported yet: the studio cannot run Codex sessions.",
    );
    expect(html).toMatch(/disabled=""[^>]*value="codex"/);
    expect(html).toContain("DeepSeek V4.1 Flash");
    expect(html).toContain("Use Hermes");
  });

  it("asks Terminal or bubble, and shows sign-in with the harness rows", async () => {
    const { SpawnAgentView } = await import("../src/agent/SpawnAgentDialog");
    const view = (step: Parameters<typeof SpawnAgentView>[0]["step"]) =>
      renderToStaticMarkup(
        <SpawnAgentView
          step={step}
          onChoose={() => {}}
          onSignIn={() => {}}
          onCheck={() => {}}
          onMode={() => {}}
          onCancel={() => {}}
        />,
      );
    const mode = view({ kind: "mode" });
    expect(mode).toContain("Open in Terminal");
    expect(mode).toContain("Run in the bubble instead");
    // Each choice is explained on its own line, not one run-on sentence.
    expect(mode).toContain("Where should Genobi work?");
    expect(mode.match(/<li>/g)).toHaveLength(2);
    const signIn = view({ kind: "sign-in", runner: "hermes", rows: rows() });
    expect(signIn).toContain("Check sign-in again");
    expect(signIn).toContain("Hermes is not signed in.");
    // The model was chosen before Hermes was set up: no list here.
    expect(signIn).not.toContain("Hermes model");
  });

  it("the studio's spawn walks the dialog's steps from the clicks", async () => {
    saved = { runner: "claude" };
    const store = await import("../src/agent/spawn-store");
    const spawning = store.spawnFromStudio({
      prompt: "Cut the drop",
      source: "typed",
    });
    await vi.waitFor(() => expect(store.spawnStep().kind).toBe("mode"));
    store.chooseMode("headless");
    expect((await spawning)?.id).toBe(SESSION.id);
    expect(store.spawnStep().kind).toBe("closed");
    expect(store.prefersTerminal()).toBe(false);
    // Closing the dialog cancels quietly: nothing starts.
    const cancelled = store.spawnFromStudio({ prompt: "Go", source: "typed" });
    await vi.waitFor(() => expect(store.spawnStep().kind).toBe("mode"));
    store.cancelSpawn();
    expect(await cancelled).toBeUndefined();
    expect(started()).toHaveLength(1);
  });
});

it("the bubble, the voice panel and the Director call the same action", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of [
    "src/agent/AgentBubble.tsx",
    "src/director/AgentPanel.tsx",
  ])
    expect(await readFile(file, "utf8")).toContain("spawnFromStudio({");
  // Voice hands its words to a running session first (Box 1.8), and spawns
  // through the same action only when none runs.
  expect(await readFile("src/voice/VoiceDestinations.tsx", "utf8")).toContain(
    "sendToGenobi({",
  );
  expect(await readFile("src/agent/send.ts", "utf8")).toContain(
    "spawn: spawnFromStudio,",
  );
  // Setup's summary calls spawnAgent itself, with its own steps.
  expect(await readFile("src/setup/start-store.ts", "utf8")).toContain(
    "await spawnAgent(",
  );
});
