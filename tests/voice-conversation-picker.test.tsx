// @vitest-environment jsdom
// The voice picker's two agent choices (issue #58): Continue names the
// conversation the next note reaches, Start new conversation is its own
// option, and a finished run that cannot resume never reads as Continue.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentSession } from "../shared/agent-session";

const { latest } = vi.hoisted(() => ({
  latest: { current: undefined as AgentSession | undefined },
}));
vi.mock("../src/agent/useAgentSession", () => ({
  useLatestAgentSession: () => latest.current,
  latestAgentSession: () => latest.current,
  showAgentSession: () => {},
  OPEN_DECK: "genobi:open-deck",
}));
vi.mock("../src/voice/agent-destination", () => ({
  voiceProjectId: () => "p1",
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const HERMES: AgentSession = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "hermes",
  status: "done",
  prompt: "Cut the drop on the beat",
  startedAt: "",
  lines: [],
  resumable: true,
};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function picker() {
  const { VoiceDestinationPicker } =
    await import("../src/voice/VoiceDestinationPicker");
  const store = await import("../src/voice/destination-store");
  await act(async () =>
    root.render(<VoiceDestinationPicker disabled={false} />),
  );
  const select = host.querySelector("select")!;
  const options = () =>
    [...select.options].map((o) => [o.value, o.textContent, o.selected]);
  const choose = async (value: string) => {
    select.value = value;
    await act(async () =>
      select.dispatchEvent(new Event("change", { bubbles: true })),
    );
  };
  return { store, options, choose };
}

it("offers Continue for a resumable conversation, and Start new as a separate choice", async () => {
  latest.current = HERMES;
  const spawn = await import("../src/agent/spawn-store");
  vi.spyOn(spawn, "sessionProject").mockReturnValue("p1");
  const { store, options, choose } = await picker();
  expect(options().slice(0, 2)).toEqual([
    ["agent", "Continue · Hermes · Cut the drop on the beat", true],
    ["agent:new", "Start new conversation", false],
  ]);
  await choose("agent:new");
  expect(store.voiceRouting()).toEqual({
    destination: "agent",
    conversation: "new",
  });
  expect(options()[1]).toEqual(["agent:new", "Start new conversation", true]);
  // Choosing Continue again is explicit too.
  await choose("agent");
  expect(store.voiceRouting().conversation).toBeUndefined();
  // Nothing about the conversation is written to browser storage.
  expect(JSON.stringify(localStorage)).not.toContain(HERMES.id);
});

it("says a pinned Claude Code run that ended cannot continue", async () => {
  const claude = { ...HERMES, runner: "claude" as const, resumable: undefined };
  latest.current = claude;
  const { store, options } = await picker();
  await act(async () => store.selectVoiceAgent(claude, "p1"));
  expect(options().slice(0, 2)).toEqual([
    ["agent", "Can't continue · Claude Code run ended", true],
    ["agent:new", "Start new conversation", false],
  ]);
});

it("names a new conversation when nothing can be continued", async () => {
  latest.current = undefined;
  const { options } = await picker();
  expect(options()[0]).toEqual(["agent", "Agent · new conversation", true]);
  expect(options().some(([value]) => value === "agent:new")).toBe(false);
});
