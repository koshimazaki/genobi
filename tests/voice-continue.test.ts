// Voice's Continue this conversation / Start new conversation (issue #58):
// Continue reaches the same conversation even after its run finished, Start
// new always spawns a clean context, and a note that cannot go where its
// label said is held rather than sent somewhere else.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../shared/agent-session";
import {
  sendVoiceToAgent,
  type VoiceAgentDeps,
} from "../src/voice/agent-destination";
import { AgentRefusal } from "../src/agent/api";

const ENDED: AgentSession = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "hermes",
  status: "done",
  prompt: "Cut the drop",
  startedAt: "2026-11-05T00:00:00Z",
  lines: [],
  resumable: true,
};
const NEXT: AgentSession = {
  ...ENDED,
  id: "22222222-2222-4222-8222-222222222222",
  status: "starting",
  continues: ENDED.id,
};
const RUNNING = { ...ENDED, status: "running" as const, resumable: undefined };
const target = { session: ENDED, projectId: "p1" };
const dependencies = (overrides: Partial<VoiceAgentDeps> = {}) => ({
  project: vi.fn(() => "p1"),
  read: vi.fn(async () => ENDED),
  active: vi.fn(async () => undefined),
  latest: vi.fn(() => undefined as AgentSession | undefined),
  message: vi.fn(async () => RUNNING),
  spawn: vi.fn(async () => NEXT),
  spawning: vi.fn(() => false),
  sessionProject: vi.fn(() => "p1"),
  show: vi.fn(),
  resume: vi.fn(async () => NEXT),
  ...overrides,
});
beforeEach(() => vi.stubGlobal("window", new EventTarget()));
afterEach(() => vi.unstubAllGlobals());
const voice = { prompt: "slower", source: "voice" };

describe("Continue this conversation", () => {
  it("resumes the selected conversation after its run finished, once", async () => {
    const deps = dependencies();
    const result = await sendVoiceToAgent("slower", "p1", target, deps);
    expect(result).toEqual({ kind: "started", session: NEXT });
    expect(deps.resume).toHaveBeenCalledExactlyOnceWith(ENDED, voice, "p1");
    expect(deps.message).not.toHaveBeenCalled();
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("continues the shown finished conversation of this project without a pin", async () => {
    const deps = dependencies({ latest: vi.fn(() => ENDED) });
    await sendVoiceToAgent("slower", "p1", undefined, deps);
    expect(deps.resume).toHaveBeenCalledExactlyOnceWith(ENDED, voice, "p1");
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("does not continue a shown conversation from another project", async () => {
    const deps = dependencies({
      latest: vi.fn(() => ENDED),
      sessionProject: vi.fn(() => "p2"),
    });
    await sendVoiceToAgent("slower", "p1", undefined, deps);
    expect(deps.resume).not.toHaveBeenCalled();
    // Nothing continuable here: the picker named a new conversation.
    expect(deps.spawn).toHaveBeenCalledOnce();
  });

  it("resumes a run that ended between the read and the send", async () => {
    const deps = dependencies({
      read: vi
        .fn()
        .mockResolvedValueOnce(RUNNING)
        .mockResolvedValueOnce(ENDED) as VoiceAgentDeps["read"],
      message: vi.fn(async () => {
        throw new AgentRefusal(
          "That session has ended.",
          "agent_session_ended",
        );
      }),
    });
    await sendVoiceToAgent("slower", "p1", target, deps);
    expect(deps.message).toHaveBeenCalledOnce();
    expect(deps.resume).toHaveBeenCalledExactlyOnceWith(ENDED, voice, "p1");
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("an unpinned running conversation that ends mid-send is resumed, not replaced", async () => {
    const deps = dependencies({
      latest: vi.fn(() => RUNNING),
      message: vi.fn(async () => {
        throw new AgentRefusal(
          "That session has ended.",
          "agent_session_ended",
        );
      }),
    });
    await sendVoiceToAgent("slower", "p1", undefined, deps);
    expect(deps.resume).toHaveBeenCalledExactlyOnceWith(ENDED, voice, "p1");
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("holds the transcript when Claude Code's finished run cannot resume", async () => {
    const claude = {
      ...ENDED,
      runner: "claude" as const,
      resumable: undefined,
    };
    const deps = dependencies({ read: vi.fn(async () => claude) });
    await expect(
      sendVoiceToAgent(
        "slower",
        "p1",
        { session: claude, projectId: "p1" },
        deps,
      ),
    ).rejects.toThrow(
      /Claude Code keeps no conversation.*Start new conversation/,
    );
    expect(deps.resume).not.toHaveBeenCalled();
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("a failed or uncertain continuation holds the words and is not retried", async () => {
    const deps = dependencies({
      resume: vi.fn(async () => {
        throw new Error("Connection uncertain.");
      }),
    });
    await expect(
      sendVoiceToAgent("slower", "p1", target, deps),
    ).rejects.toThrow("Connection uncertain.");
    expect(deps.resume).toHaveBeenCalledOnce();
    expect(deps.spawn).not.toHaveBeenCalled();
    expect(deps.message).not.toHaveBeenCalled();
  });

  it("holds a continuation when the project changed during the lookup", async () => {
    let project = "p1";
    const deps = dependencies({
      project: () => project,
      read: vi.fn(async () => {
        project = "p2";
        return ENDED;
      }),
    });
    await expect(
      sendVoiceToAgent("slower", "p1", target, deps),
    ).rejects.toThrow("project changed");
    expect(deps.resume).not.toHaveBeenCalled();
  });
});

describe("Start new conversation", () => {
  it("always spawns, even with a running or resumable conversation selected", async () => {
    for (const session of [RUNNING, ENDED]) {
      const deps = dependencies({
        latest: vi.fn(() => session),
        read: vi.fn(async () => session),
      });
      const result = await sendVoiceToAgent(
        "a new idea",
        "p1",
        undefined,
        deps,
        "new",
      );
      expect(result).toMatchObject({ kind: "started" });
      expect(deps.spawn).toHaveBeenCalledExactlyOnceWith({
        prompt: "a new idea",
        source: "voice",
      });
      expect(deps.message).not.toHaveBeenCalled();
      expect(deps.resume).not.toHaveBeenCalled();
    }
  });

  it("holds the words while another spawn is being set up", async () => {
    const deps = dependencies({ spawning: () => true });
    await expect(
      sendVoiceToAgent("a new idea", "p1", undefined, deps, "new"),
    ).rejects.toThrow("already being started");
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("a refused start (another run must finish first) holds the words", async () => {
    const deps = dependencies({
      spawn: vi.fn(async () => {
        throw new Error(
          "Genobi is already running a session. Stop it there to start another.",
        );
      }),
    });
    await expect(
      sendVoiceToAgent("a new idea", "p1", undefined, deps, "new"),
    ).rejects.toThrow("Stop it there");
    expect(deps.spawn).toHaveBeenCalledOnce();
  });
});
