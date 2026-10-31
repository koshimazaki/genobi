// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentSession } from "../shared/agent-session";
const SESSION: AgentSession = {
  id: "one",
  runner: "hermes",
  status: "running",
  prompt: "Edit",
  startedAt: "",
  lines: [],
};
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

it("conversation selection preserves its known project after the open project changes", async () => {
  const spawn = await import("../src/agent/spawn-store");
  vi.spyOn(spawn, "sessionProject").mockReturnValue("original-project");
  const store = await import("../src/voice/destination-store");
  store.openAgentVoice(SESSION, "new-project");
  expect(store.voiceRouting().agent).toEqual({
    session: SESSION,
    projectId: "original-project",
  });
});

it("defaults to agent and remembers only a validated destination, with private-storage fallback", async () => {
  const store = await import("../src/voice/destination-store");
  expect(store.voiceRouting()).toEqual({ destination: "agent" });
  store.setVoiceDestination("prompt:description");
  expect(localStorage.getItem(store.DESTINATION_KEY)).toBe(
    "prompt:description",
  );
  expect(store.readVoiceDestination()).toBe("prompt:description");
  localStorage.setItem(store.DESTINATION_KEY, "prompt:password");
  expect(store.readVoiceDestination()).toBe("agent");
  expect(
    store.readVoiceDestination({
      getItem: () => {
        throw Error();
      },
      setItem: () => {},
    }),
  ).toBe("agent");
});

it("pins the conversation across notes without persisting project or session identities", async () => {
  const store = await import("../src/voice/destination-store");
  const selected = store.voiceRouting();
  store.rememberVoiceAgent(
    { session: SESSION, projectId: "project-one" },
    selected,
  );
  expect(store.voiceRouting().agent?.session.id).toBe("one");
  expect(JSON.stringify(localStorage)).not.toContain("project-one");
  expect(JSON.stringify(localStorage)).not.toContain('"one"');
  store.setVoiceDestination("prompt");
  store.setVoiceDestination("agent");
  expect(store.voiceRouting().agent?.session.id).toBe("one");
});

it("a late send result cannot replace an explicitly selected conversation", async () => {
  const store = await import("../src/voice/destination-store");
  const before = store.voiceRouting();
  store.selectVoiceAgent({ ...SESSION, id: "two" }, "p2");
  store.rememberVoiceAgent({ session: SESSION, projectId: "p1" }, before);
  expect(store.voiceRouting().agent?.session.id).toBe("two");
});

it("keeps one delivery in flight independently of overlay remounts and selection changes", async () => {
  const store = await import("../src/voice/destination-store");
  expect(store.beginVoiceDelivery()).toBe(true);
  expect(store.voiceDeliveryPending()).toBe(true);
  store.selectVoiceAgent(SESSION);
  expect(store.beginVoiceDelivery()).toBe(false);
  store.endVoiceDelivery();
  expect(store.voiceDeliveryPending()).toBe(false);
  expect(store.beginVoiceDelivery()).toBe(true);
  store.endVoiceDelivery();
});
