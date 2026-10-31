import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../shared/agent-session";
import {
  sendVoiceToAgent,
  type VoiceAgentDeps,
} from "../src/voice/agent-destination";
import { AgentRefusal } from "../src/agent/api";

const SESSION: AgentSession = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "hermes",
  status: "running",
  prompt: "Cut the drop",
  startedAt: "2026-10-31T00:00:00Z",
  lines: [],
};
const OTHER = { ...SESSION, id: "22222222-2222-4222-8222-222222222222" };
const target = { session: SESSION, projectId: "p1" };
const dependencies = (overrides: Partial<VoiceAgentDeps> = {}) => ({
  project: vi.fn(() => "p1"),
  read: vi.fn(async () => SESSION),
  active: vi.fn(async () => undefined),
  latest: vi.fn(() => OTHER),
  message: vi.fn(async () => SESSION),
  spawn: vi.fn(async () => SESSION),
  spawning: vi.fn(() => false),
  sessionProject: vi.fn(() => "p1"),
  show: vi.fn(),
  ...overrides,
});
beforeEach(() => vi.stubGlobal("window", new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

describe("the selected voice conversation", () => {
  it("sends a Camera-shaped request to the selected session, even when another is shown", async () => {
    const deps = dependencies();
    const result = await sendVoiceToAgent(
      "make an image with FLUX of a penguin",
      "p1",
      target,
      deps,
    );
    expect(result).toMatchObject({ kind: "sent", session: SESSION });
    expect(deps.read).toHaveBeenCalledWith(SESSION.id);
    expect(deps.message).toHaveBeenCalledWith(SESSION.id, {
      prompt: "make an image with FLUX of a penguin",
      source: "voice",
    });
    expect(deps.latest).not.toHaveBeenCalled();
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("holds an ended selected session instead of starting or picking another one", async () => {
    const deps = dependencies({
      read: vi.fn(async () => ({ ...SESSION, status: "done" as const })),
    });
    await expect(
      sendVoiceToAgent("slower", "p1", target, deps),
    ).rejects.toThrow("conversation has finished");
    expect(deps.message).not.toHaveBeenCalled();
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it.each([
    "agent_session_ended",
    "agent_no_live_transport",
    "agent_session_missing",
  ])("does not retry or switch destinations after %s", async (code) => {
    const deps = dependencies({
      message: vi.fn(async () => {
        throw new AgentRefusal("Unavailable", code);
      }),
    });
    await expect(
      sendVoiceToAgent("slower", "p1", target, deps),
    ).rejects.toThrow("Unavailable");
    expect(deps.message).toHaveBeenCalledOnce();
    expect(deps.spawn).not.toHaveBeenCalled();
    expect(deps.active).not.toHaveBeenCalled();
  });

  it("does not call a message route for a relayed conversation", async () => {
    const deps = dependencies({
      read: vi.fn(async () => ({
        ...SESSION,
        localSessionUrl: "http://127.0.0.1:4317/",
      })),
    });
    await expect(
      sendVoiceToAgent("slower", "p1", target, deps),
    ).rejects.toThrow("local studio");
    expect(deps.message).not.toHaveBeenCalled();
  });

  it("holds a note when the project changed before or during lookup", async () => {
    const wrong = dependencies({ project: () => "p2" });
    await expect(
      sendVoiceToAgent("slower", "p1", target, wrong),
    ).rejects.toThrow("project changed");
    expect(wrong.read).not.toHaveBeenCalled();
    let project = "p1";
    const during = dependencies({
      project: () => project,
      read: vi.fn(async () => {
        project = "p2";
        return SESSION;
      }),
    });
    await expect(
      sendVoiceToAgent("slower", "p1", target, during),
    ).rejects.toThrow("project changed");
    expect(during.message).not.toHaveBeenCalled();
  });

  it("preserves a queued message's pending result", async () => {
    const queued = {
      ...SESSION,
      exchange: [
        { from: "person" as const, text: "slower", at: "", pending: true },
      ],
    };
    const deps = dependencies({ message: vi.fn(async () => queued) });
    expect(await sendVoiceToAgent("slower", "p1", target, deps)).toMatchObject({
      kind: "sent",
      session: { exchange: [{ pending: true }] },
    });
  });

  it("refuses an invalid transcript before looking up or sending anything", async () => {
    const deps = dependencies();
    await expect(
      sendVoiceToAgent("a".repeat(4001), "p1", target, deps),
    ).rejects.toThrow("4000");
    expect(deps.read).not.toHaveBeenCalled();
  });
});

describe("choosing an agent for the first note", () => {
  it("sends to the known current-project session", async () => {
    const deps = dependencies();
    await sendVoiceToAgent("Make it slower", "p1", undefined, deps);
    expect(deps.message).toHaveBeenCalledWith(OTHER.id, {
      prompt: "Make it slower",
      source: "voice",
    });
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("skips an old-project shown session and uses a current-project active session", async () => {
    const deps = dependencies({
      active: vi.fn(async () => SESSION),
      sessionProject: (id) => (id === OTHER.id ? "p2" : "p1"),
    });
    await sendVoiceToAgent("Make it slower", "p1", undefined, deps);
    expect(deps.message).toHaveBeenCalledWith(SESSION.id, {
      prompt: "Make it slower",
      source: "voice",
    });
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("starts in the current project when shown and active sessions belong elsewhere", async () => {
    const deps = dependencies({
      active: vi.fn(async () => SESSION),
      sessionProject: () => "p2",
    });
    await sendVoiceToAgent("Build a room", "p1", undefined, deps);
    expect(deps.message).not.toHaveBeenCalled();
    expect(deps.spawn).toHaveBeenCalledWith({
      prompt: "Build a room",
      source: "voice",
    });
  });

  it.each(["shown", "active"])(
    "holds an unknown %s session until explicitly selected when a project is open",
    async (source) => {
      const deps = dependencies({
        latest: () => (source === "shown" ? SESSION : undefined),
        active: vi.fn(async () => SESSION),
        sessionProject: () => undefined,
      });
      await expect(
        sendVoiceToAgent("Build a room", "p1", undefined, deps),
      ).rejects.toThrow("project is unknown");
      expect(deps.message).not.toHaveBeenCalled();
      expect(deps.spawn).not.toHaveBeenCalled();
      expect(deps.show).toHaveBeenCalledWith(SESSION);
      // Selecting this log explicitly allows a recovered session to be used.
      await sendVoiceToAgent("Build a room", "p1", target, deps);
      expect(deps.message).toHaveBeenCalledOnce();
    },
  );

  it("refuses a known other-project session even if its selection was labelled current", async () => {
    const deps = dependencies({ sessionProject: () => "p2" });
    await expect(
      sendVoiceToAgent("Build a room", "p1", target, deps),
    ).rejects.toThrow("project changed");
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.message).not.toHaveBeenCalled();
  });

  it("holds the transcript instead of sharing an unrelated in-flight spawn", async () => {
    const deps = dependencies({
      latest: () => undefined,
      spawning: () => true,
    });
    await expect(
      sendVoiceToAgent("Build a room", "p1", undefined, deps),
    ).rejects.toThrow("already being started");
    expect(deps.spawn).not.toHaveBeenCalled();
    expect(deps.message).not.toHaveBeenCalled();
  });
  it("uses the existing send/spawn path, with voice source and no generation request", async () => {
    const deps = dependencies({ latest: () => undefined });
    expect(
      await sendVoiceToAgent("Build a room", "p1", undefined, deps),
    ).toMatchObject({ kind: "started" });
    expect(deps.spawn).toHaveBeenCalledWith({
      prompt: "Build a room",
      source: "voice",
    });
    expect(deps.message).not.toHaveBeenCalled();
  });

  it("does not spawn into a newly opened project after an active-session lookup", async () => {
    let project = "p1";
    const deps = dependencies({
      project: () => project,
      latest: () => undefined,
      active: vi.fn(async () => {
        project = "p2";
        return undefined;
      }),
    });
    await expect(
      sendVoiceToAgent("Build a room", "p1", undefined, deps),
    ).rejects.toThrow("project changed");
    expect(deps.spawn).not.toHaveBeenCalled();
  });
});
