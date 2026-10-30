import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SetupDraft } from "../src/setup/state";
import { SUMMARY_STEP } from "../src/setup/SetupChoices";
import type { VoiceStatus } from "../src/voice/api";

/**
 * Setup's "Save & set up" is the explicit confirmation for voice: it asks for
 * a fresh grant, then starts the install with `confirmed: true`, the token and
 * the chosen folder. It is offered only when the installer's own check
 * (`GET /api/voice/setup`) says this machine can install.
 */
const LOCAL: VoiceStatus = { available: false, maxSeconds: 180 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let grants = 0;
let supported = true;
let progress: { phase: string; bytes: number; busy: boolean }[] = [];
/** What the server's search for an existing model answers. */
let found: { folder: string; label: string; source: string }[] = [];
const FOUND = {
  folder: "/Users/someone/Documents/asr/Qwen3-ASR-0.6B",
  label: "~/Documents/asr/Qwen3-ASR-0.6B",
  source: "search",
};
const server = vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  if (url === "/api/voice/setup" && method === "GET")
    return json({
      token: `grant-${++grants}`,
      model: "Qwen3-ASR-0.6B",
      bytes: 1_880_560_703,
      folder: "/Users/someone/genobi/models",
      browse: false,
      supported,
      ...(supported ? {} : { reason: "Install Python 3.11 to enable it." }),
      state: { phase: "idle", bytes: 0, busy: false },
    });
  if (url === "/api/voice/setup" && method === "POST")
    return json({ phase: "environment", bytes: 0, busy: true }, 202);
  if (url === "/api/voice/setup" && method === "DELETE")
    return json({ phase: "cancelled", bytes: 0, busy: false });
  if (url === "/api/voice/setup/found") return json({ models: found });
  if (url === "/api/voice/setup/progress")
    return json(progress.shift() ?? { phase: "ready", bytes: 0, busy: false });
  if (url === "/api/voice/prewarm") return json({ warming: true }, 202);
  throw new Error(`Unexpected request ${method} ${url}`);
});
const calls = () =>
  server.mock.calls.map(([url, init]) => [init?.method ?? "GET", url]);
const page = new EventTarget();

beforeEach(() => {
  vi.resetModules();
  grants = 0;
  supported = true;
  progress = [];
  found = [];
  server.mockClear();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("fetch", server);
  vi.stubGlobal("window", page);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Fresh modules per test, so the page-wide install store starts empty; then
 * the summary step's prerequisite read, as the dialog does on opening it.
 */
async function load({ check = true } = {}) {
  const footer = await import("../src/setup/SetupFooter");
  const store = await import("../src/voice/install-store");
  const start = await import("../src/setup/start-store");
  if (check) {
    await store.checkVoiceInstall();
    server.mockClear();
  }
  return { ...footer, ...store, ...start };
}
function props(
  modules: Awaited<ReturnType<typeof load>>,
  draft: SetupDraft,
  voiceStatus: VoiceStatus | undefined = LOCAL,
) {
  return {
    step: SUMMARY_STEP,
    draft,
    voiceStatus,
    install: modules.voiceInstall(),
    // No harness here: Save & set up installs voice and starts nothing.
    agent: { ready: false },
    start: modules.setupStart(),
    onBack: () => {},
    onClose: () => {},
    onFinish: vi.fn(),
  };
}
/** The footer has no hooks, so its element tree can be walked and clicked. */
type Clickable = ReactElement<{
  children?: ReactNode;
  onClick?: () => unknown;
  disabled?: boolean;
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
const voiceDraft: SetupDraft = {
  selection: { execution: "local", agent: "claude" },
  voice: true,
};

describe("setup's Save & set up", () => {
  it("is the primary only when voice is ticked on a server that can install it", async () => {
    const modules = await load();
    const { SetupFooter } = modules;
    const html = (draft: SetupDraft, status?: VoiceStatus) =>
      renderToStaticMarkup(<SetupFooter {...props(modules, draft, status)} />);
    expect(html(voiceDraft)).toContain(
      '<button class="setup-primary">Save &amp; set up</button>',
    );
    expect(html({ ...voiceDraft, voice: false })).not.toContain("set up");
    expect(
      html(voiceDraft, { available: true, maxSeconds: 180 }),
    ).not.toContain("set up");
    expect(html(voiceDraft, { available: false, maxSeconds: 0 })).not.toContain(
      "set up",
    );
    // With a provider to connect too, voice setup still takes the primary.
    const cloud = html({ ...voiceDraft, selection: { execution: "cloud" } });
    // Voice setup takes the one primary; no second "connect provider".
    expect(cloud).not.toContain("Save &amp; connect provider");
    expect(cloud).toContain(
      '<button class="setup-primary">Save &amp; set up</button>',
    );
    expect(server).not.toHaveBeenCalled();
  });

  it("is not offered before the prerequisite check, or when it fails", async () => {
    const unchecked = await load({ check: false });
    expect(
      renderToStaticMarkup(
        <unchecked.SetupFooter {...props(unchecked, voiceDraft)} />,
      ),
    ).not.toContain("set up");
    vi.resetModules();
    supported = false;
    const modules = await load();
    expect(
      renderToStaticMarkup(
        <modules.SetupFooter {...props(modules, voiceDraft)} />,
      ),
    ).toContain("Save &amp; explore");
    expect(
      renderToStaticMarkup(
        <modules.SetupFooter {...props(modules, voiceDraft)} />,
      ),
    ).not.toContain("set up");
    const { default: SetupNext } = await import("../src/setup/SetupNext");
    const html = renderToStaticMarkup(
      <SetupNext draft={voiceDraft} onChange={() => {}} voiceStatus={LOCAL} />,
    );
    expect(html).toContain("Install Python 3.11 to enable it.");
    expect(html).not.toContain('aria-label="Voice installation folder"');
  });

  it("explains the install inline and keeps the manual path", async () => {
    await load();
    const { default: SetupNext } = await import("../src/setup/SetupNext");
    const html = renderToStaticMarkup(
      <SetupNext draft={voiceDraft} onChange={() => {}} voiceStatus={LOCAL} />,
    );
    expect(html).toContain(
      "<strong>Save &amp; set up</strong> first looks for Qwen3-ASR-0.6B",
    );
    expect(html).toContain('aria-label="Voice installation folder"');
    expect(html).toContain("use the mic in the studio header");
    expect(html).not.toContain("Yes, install Voice Mode");
    expect(server).not.toHaveBeenCalled();
  });

  it("requests the grant, then starts the install with confirmed: true, and connects", async () => {
    const modules = await load();
    const ready = vi.fn();
    page.addEventListener(modules.VOICE_READY, ready);
    const draft = { ...voiceDraft, voiceFolder: "/Volumes/Work/voice" };
    const click = button(
      modules.SetupFooter(props(modules, draft)),
      "Save & set up",
    );
    await click!.props.onClick!();
    // It looks for the model on this machine before anything installs.
    expect(calls()).toEqual([
      ["GET", "/api/voice/setup/found"],
      ["GET", "/api/voice/setup"],
      ["POST", "/api/voice/setup"],
    ]);
    expect(JSON.parse(String(server.mock.calls[2][1]!.body))).toEqual({
      token: "grant-2",
      folder: "/Volumes/Work/voice",
      confirmed: true,
    });
    expect(localStorage.getItem("genobi-setup-voice-v1")).toBe("true");
    expect(modules.voiceInstall().state).toMatchObject({ busy: true });
    // While running, the button says so and cannot start a second install.
    expect(
      button(modules.SetupFooter(props(modules, draft)), "Setting up voice…")
        ?.props,
    ).toMatchObject({ disabled: true });

    progress = [
      { phase: "download", bytes: 500, busy: true },
      { phase: "ready", bytes: 1_880_560_703, busy: false },
    ];
    await vi.advanceTimersByTimeAsync(800 + 1200);
    expect(calls().slice(3)).toEqual([
      ["GET", "/api/voice/setup/progress"],
      ["GET", "/api/voice/setup/progress"],
      ["POST", "/api/voice/prewarm"],
    ]);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(modules.voiceInstall().state?.phase).toBe("ready");
    page.removeEventListener(modules.VOICE_READY, ready);
  });

  it("sends the server's default folder when none was typed", async () => {
    const modules = await load();
    const click = button(
      modules.SetupFooter(props(modules, voiceDraft)),
      "Save & set up",
    );
    await click!.props.onClick!();
    expect(JSON.parse(String(server.mock.calls[2][1]!.body))).toMatchObject({
      folder: "/Users/someone/genobi/models",
      confirmed: true,
    });
  });

  it("uses a verified model already on this machine, or downloads when asked", async () => {
    found = [FOUND];
    const modules = await load();
    const click = (draft: SetupDraft) =>
      button(modules.SetupFooter(props(modules, draft)), "Save & set up")!.props
        .onClick!();
    await click(voiceDraft);
    const body = (index: number) =>
      JSON.parse(String(server.mock.calls[index][1]!.body));
    // The first found model is used by default: no download.
    expect(body(2)).toMatchObject({ model: FOUND.folder, confirmed: true });
    await modules.cancelVoiceInstall();
    server.mockClear();
    // "Download a new copy" (null) sends no model; the search is not repeated.
    await click({ ...voiceDraft, voiceModel: null });
    expect(calls()).toEqual([
      ["GET", "/api/voice/setup"],
      ["POST", "/api/voice/setup"],
    ]);
    expect(body(1)).not.toHaveProperty("model");
  });

  it("offers the found model before the download in the summary", async () => {
    found = [FOUND];
    const modules = await load();
    await modules.findVoiceModels();
    const { default: SetupNext } = await import("../src/setup/SetupNext");
    const html = renderToStaticMarkup(
      <SetupNext draft={voiceDraft} onChange={() => {}} voiceStatus={LOCAL} />,
    );
    expect(html).toContain(
      "Use this one <code>~/Documents/asr/Qwen3-ASR-0.6B</code>",
    );
    expect(html).toContain("Download a new copy");
    expect(html).toMatch(/checked=""[^>]*\/>Use this one/);
    found = [];
    await modules.findVoiceModels();
    expect(
      renderToStaticMarkup(
        <SetupNext
          draft={voiceDraft}
          onChange={() => {}}
          voiceStatus={LOCAL}
        />,
      ),
    ).toContain("No verified copy is on this machine");
  });

  it("cancel leaves setup usable, and the next attempt asks for a new grant", async () => {
    const modules = await load();
    const start = () =>
      button(modules.SetupFooter(props(modules, voiceDraft)), "Save & set up")!
        .props.onClick!();
    await start();
    await modules.cancelVoiceInstall();
    expect(modules.voiceInstall().state).toMatchObject({
      phase: "cancelled",
      busy: false,
    });
    await start();
    expect(calls()).toEqual([
      ["GET", "/api/voice/setup/found"],
      ["GET", "/api/voice/setup"],
      ["POST", "/api/voice/setup"],
      ["DELETE", "/api/voice/setup"],
      ["GET", "/api/voice/setup"],
      ["POST", "/api/voice/setup"],
    ]);
    expect(JSON.parse(String(server.mock.calls[5][1]!.body)).token).toBe(
      "grant-3",
    );
  });
});
