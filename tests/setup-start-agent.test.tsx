import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SetupDraft } from "../src/setup/state";
import { SUMMARY_STEP } from "../src/setup/SetupChoices";
import type { VoiceStatus } from "../src/voice/api";
import type { AgentRunnerStatus } from "../shared/agent-session";
import type { HarnessSignIn } from "../shared/agent-runner-setting";

/**
 * Setup ends by starting ONE agent session (Box 1.4): the summary's primary
 * saves, installs voice when ticked, waits for VOICE_READY, then posts the
 * Project prompt's start route with `setup: true`. An unavailable harness
 * shows its reason and nothing starts.
 */
const LOCAL: VoiceStatus = { available: false, maxSeconds: 180 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "starting",
  prompt: "Genobi setup just finished.",
  startedAt: "2026-10-27T12:00:00.000Z",
  lines: ["Starting Claude Code…"],
};
let agent: AgentRunnerStatus = { available: true, runner: "claude" };
/** The harness saved in setup's Connect step (`.local/agent.json`). */
let saved: string | null = "claude";
let progress: { phase: string; bytes: number; busy: boolean; error?: string }[];
const server = vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  if (url === "/api/agent/status") return json(agent);
  if (url === "/api/settings/agent-runner" && method === "GET")
    return json({
      saved: { runner: saved },
      environment: false,
      hermesProvider: false,
    });
  if (url === "/api/agent/sign-in") return json({ harnesses: [] });
  if (url === "/api/keys")
    return json({
      keys: {
        keychain: true,
        comfy: { connected: true, source: "keychain", revision: 2 },
        bfl: { connected: false, revision: 0 },
      },
    });
  if (url === "/api/agent/sessions" && method === "POST")
    return json(SESSION, 201);
  if (url === "/api/voice/setup" && method === "GET")
    return json({
      token: "grant",
      model: "Qwen3-ASR-0.6B",
      bytes: 1_880_560_703,
      folder: "/Users/someone/.genobi",
      browse: false,
      supported: true,
      state: { phase: "idle", bytes: 0, busy: false },
    });
  if (url === "/api/voice/setup" && method === "POST")
    return json({ phase: "environment", bytes: 0, busy: true }, 202);
  if (url === "/api/voice/setup/found") return json({ models: [] });
  if (url === "/api/voice/setup/progress")
    return json(progress.shift() ?? { phase: "ready", bytes: 0, busy: false });
  if (url === "/api/voice/prewarm") return json({ warming: true }, 202);
  throw new Error(`Unexpected request ${method} ${url}`);
});
const calls = () =>
  server.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);
const starts = () =>
  server.mock.calls.filter(([url]) => url === "/api/agent/sessions");

beforeEach(() => {
  vi.resetModules();
  agent = { available: true, runner: "claude" };
  saved = "claude";
  progress = [];
  server.mockClear();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("fetch", server);
  vi.stubGlobal("window", new EventTarget());
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function load() {
  const footer = await import("../src/setup/SetupFooter");
  const voice = await import("../src/voice/install-store");
  const start = await import("../src/setup/start-store");
  const handoff = await import("../src/setup/handoff");
  const shown = await import("../src/agent/useAgentSession");
  await voice.checkVoiceInstall();
  server.mockClear();
  return { ...footer, ...voice, ...start, ...handoff, ...shown };
}
type Modules = Awaited<ReturnType<typeof load>>;
const onFinish = vi.fn();
/** The local studio: its sign-in route answered (no row signed out). */
const ROWS: HarnessSignIn[] = [];
function footer(
  m: Modules,
  draft: SetupDraft,
  status = LOCAL,
  rows: HarnessSignIn[] | null = ROWS,
) {
  return m.SetupFooter({
    step: SUMMARY_STEP,
    draft,
    voiceStatus: status,
    install: m.voiceInstall(),
    agent: m.agentReadiness(draft, agent, rows),
    signIn: rows,
    start: m.setupStart(),
    onBack: () => {},
    onClose: () => {},
    onFinish,
  });
}
type Clickable = ReactElement<{
  children?: ReactNode;
  onClick?: () => unknown;
}>;
function button(node: ReactNode, label: string): Clickable | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = button(child, label);
      if (found) return found;
    }
    return undefined;
  }
  const element = node as Clickable;
  if (element.type === "button" && element.props.children === label)
    return element;
  return button(element.props.children, label);
}
const body = (index = 0) => JSON.parse(String(starts()[index][1]!.body));
const draft: SetupDraft = {
  selection: { agent: "claude", execution: "cloud" },
  usage: { purpose: "commercial-video", policy: "any-licensed" },
};

describe("setup's last step starts the agent", () => {
  it("with voice off, Save & start Genobi starts one typed setup session", async () => {
    onFinish.mockClear();
    const m = await load();
    await button(footer(m, draft), "Save & start Genobi")!.props.onClick!();
    expect(starts()).toHaveLength(1);
    const sent = body();
    expect(sent).toMatchObject({
      source: "typed",
      setup: true,
      context: {
        picks: [],
        selection: draft.selection,
        usage: draft.usage,
      },
    });
    expect(sent.prompt).toContain("Agent: Claude Code.");
    expect(sent.prompt).toContain("Generation runs on the web");
    expect(sent.prompt).toContain("Keys connected: Comfy.");
    expect(sent.prompt).toContain("Licence: commercial use");
    expect(sent.prompt).toContain("Voice: not requested.");
    // Slot names only: no key, no key status internals, no folder.
    const text = JSON.stringify(sent);
    for (const absent of ["keychain", "revision", "COMFY_API_KEY", "/Users/"])
      expect(text).not.toContain(absent);
    expect(Object.keys(sent).sort()).toEqual(
      ["context", "prompt", "setup", "source"].sort(),
    );
    // Saved where setup's choices live, opened in the bubble, dialog closed.
    expect(
      JSON.parse(localStorage.getItem("genobi-usage-preference-v1")!),
    ).toEqual(draft.usage);
    expect(m.shownAgentSession()?.id).toBe(SESSION.id);
    expect(m.setupStart().phase).toBe("started");
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("with voice on, waits for VOICE_READY before it starts", async () => {
    const m = await load();
    const voiced = { ...draft, voice: true };
    await button(footer(m, voiced), "Save & set up")!.props.onClick!();
    expect(calls()).toEqual([
      "GET /api/voice/setup/found",
      "GET /api/voice/setup",
      "POST /api/voice/setup",
    ]);
    expect(button(footer(m, voiced), "Setting up voice…")).toBeDefined();
    progress = [{ phase: "download", bytes: 500, busy: true }];
    await vi.advanceTimersByTimeAsync(800);
    expect(starts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1200);
    await vi.waitFor(() => expect(starts()).toHaveLength(1));
    const order = calls();
    expect(order.indexOf("POST /api/voice/prewarm")).toBeLessThan(
      order.indexOf("POST /api/agent/sessions"),
    );
    expect(body().prompt).toContain("Voice: installed");
    // The folder typed on the page is never part of the start.
    expect(JSON.stringify(body())).not.toContain(".genobi");
  });

  it("a failed install offers Start Genobi anyway, and nothing starts before it", async () => {
    const m = await load();
    const voiced = { ...draft, voice: true };
    await button(footer(m, voiced), "Save & set up")!.props.onClick!();
    progress = [
      { phase: "error", bytes: 0, busy: false, error: "Download failed." },
    ];
    await vi.advanceTimersByTimeAsync(800);
    expect(m.setupStart()).toEqual({
      phase: "voice-failed",
      message: "Download failed.",
    });
    expect(starts()).toHaveLength(0);
    await button(footer(m, voiced), "Start Genobi anyway")!.props.onClick!();
    expect(starts()).toHaveLength(1);
    expect(body().prompt).toContain(
      "Voice: requested, but the install did not finish.",
    );
  });

  it("an unavailable harness shows its reason, offers Sign in and starts nothing", async () => {
    agent = {
      available: false,
      runner: "claude",
      message: "Claude Code was not found on this machine.",
    };
    const m = await load();
    const { SetupAgentView } = await import("../src/setup/SetupAgent");
    const readiness = m.agentReadiness(draft, agent, ROWS);
    const html = renderToStaticMarkup(
      <SetupAgentView
        draft={draft}
        installVoice={false}
        readiness={readiness}
        rows={[
          {
            runner: "claude",
            name: "Claude Code",
            installed: true,
            signedIn: false,
          },
        ]}
        start={m.setupStart()}
        message=""
        onSignIn={() => {}}
        onCheck={() => {}}
      />,
    );
    expect(html).toContain("Claude Code was not found on this machine.");
    expect(html).toContain("Sign in to Claude Code");
    expect(html).not.toContain("href=");
    const markup = renderToStaticMarkup(footer(m, draft));
    expect(markup).not.toContain("Save &amp; start Genobi");
    expect(markup).not.toContain("Save &amp; set up");
    // With voice ticked, Save & set up installs voice and starts nothing.
    const voiced = { ...draft, voice: true };
    await button(footer(m, voiced), "Save & set up")!.props.onClick!();
    await vi.advanceTimersByTimeAsync(800);
    expect(calls()).toContain("POST /api/voice/prewarm");
    expect(starts()).toHaveLength(0);
    expect(m.setupStart().phase).toBe("idle");
  });

  it("re-reads the harness at the click and starts nothing if it went away", async () => {
    const m = await load();
    const view = footer(m, draft);
    agent = { available: false, message: "No agent is set up on this server." };
    await button(view, "Save & start Genobi")!.props.onClick!();
    expect(starts()).toHaveLength(0);
    expect(m.setupStart()).toEqual({
      phase: "failed",
      message: "No agent is set up on this server.",
    });
  });

  it("the hosted studio with a paired runner online starts nothing", async () => {
    // The Worker relay answers available; the sign-in route is missing (null).
    const m = await load();
    const markup = renderToStaticMarkup(footer(m, draft, LOCAL, null));
    expect(markup).not.toContain("Save &amp; start Genobi");
    const { SetupAgentView } = await import("../src/setup/SetupAgent");
    const html = renderToStaticMarkup(
      <SetupAgentView
        draft={draft}
        installVoice={false}
        readiness={m.agentReadiness(draft, agent, null)}
        rows={null}
        start={m.setupStart()}
        message=""
        onSignIn={() => {}}
        onCheck={() => {}}
      />,
    );
    expect(html).toContain(m.SETUP_LOCAL_ONLY);
    expect(html).not.toContain("Sign in to");
    // Even a direct start re-checks with the missing rows and posts nothing.
    await m.saveAndStart(draft, {
      installVoice: false,
      startAgent: true,
      signIn: null,
      onStarted: onFinish,
    });
    expect(starts()).toHaveLength(0);
    expect(m.setupStart()).toEqual({
      phase: "failed",
      message: m.SETUP_LOCAL_ONLY,
    });
  });

  it("voice ticked where it cannot install says so in the prompt", async () => {
    const m = await load();
    await m.saveAndStart(
      { ...draft, voice: true },
      {
        installVoice: false,
        startAgent: true,
        voiceConnected: false,
        signIn: ROWS,
        onStarted: onFinish,
      },
    );
    expect(starts()).toHaveLength(1);
    expect(body().prompt).toContain(
      "Voice: requested, but this machine cannot install it.",
    );
  });

  it("without a saved runner, fails with the reason and never reaches started", async () => {
    // Box 1.6: the server answers available (the environment's runner,
    // say) but nothing was saved in setup, and setup cannot ask.
    saved = null;
    onFinish.mockClear();
    const m = await load();
    const { NO_SAVED_RUNNER } = await import("../src/agent/spawn");
    await button(footer(m, draft), "Save & start Genobi")!.props.onClick!();
    expect(starts()).toHaveLength(0);
    expect(m.setupStart()).toEqual({
      phase: "failed",
      message: NO_SAVED_RUNNER,
    });
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("goes through the shared spawn action: Terminal where the server can, or the bubble", async () => {
    agent = { available: true, runner: "claude", terminal: true };
    const m = await load();
    await button(footer(m, draft), "Save & start Genobi")!.props.onClick!();
    expect(calls()).toEqual([
      "GET /api/keys",
      "GET /api/agent/status",
      "GET /api/settings/agent-runner",
      "GET /api/agent/sign-in",
      "POST /api/agent/sessions",
    ]);
    expect(body()).toMatchObject({ setup: true, mode: "terminal" });
    // "Run in the bubble instead" on the summary: the next start is headless.
    const store = await import("../src/agent/spawn-store");
    store.setPrefersTerminal(false);
    m.resetSetupStart();
    await button(footer(m, draft), "Save & start Genobi")!.props.onClick!();
    expect(body(1)).not.toHaveProperty("mode");
  });
});

// These fixtures exercise local voice; hosted detection is covered separately.
vi.mock("../src/hosted-studio", () => ({
  readHostedStudio: async () => false,
  useHostedStudio: () => false,
}));
