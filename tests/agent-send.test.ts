// Box 1.8: the studio's words go to the running session as its next
// message, start a session only when none runs, and go to the clipboard
// when the running session takes no further input. Fakes only.
import { describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../shared/agent-session";
import { AgentRefusal } from "../src/agent/api";
import { copiedText, sendToGenobi, type SendDeps } from "../src/agent/send";

const RUNNING: AgentSession = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "running",
  prompt: "Cut the drop",
  startedAt: "2026-10-27T12:00:00.000Z",
  lines: [],
  live: true,
};
const WORDS = { prompt: "Make the headline softer", source: "voice" as const };

function deps(overrides: Partial<SendDeps> = {}) {
  const calls = {
    message: vi.fn(async (id: string) => ({ ...RUNNING, id, idle: undefined })),
    spawn: vi.fn(async () => ({ ...RUNNING, id: "new" })),
    show: vi.fn(),
    copy: vi.fn(async () => true),
    active: vi.fn(async () => undefined),
  };
  return {
    calls,
    use: {
      latest: () => undefined,
      ...calls,
      ...overrides,
    } as Partial<SendDeps>,
  };
}

describe("sending words to Genobi", () => {
  it("hands them to the running session, never starting another", async () => {
    const { calls, use } = deps({ latest: () => RUNNING });
    const outcome = await sendToGenobi(WORDS, use);
    expect(outcome.kind).toBe("sent");
    expect(calls.message).toHaveBeenCalledWith(RUNNING.id, WORDS);
    expect(calls.spawn).not.toHaveBeenCalled();
    expect(calls.show).toHaveBeenCalledOnce();
  });

  it("finds the running session after a reload before starting one", async () => {
    const { calls, use } = deps({ active: async () => RUNNING });
    expect((await sendToGenobi(WORDS, use)).kind).toBe("sent");
    expect(calls.spawn).not.toHaveBeenCalled();
  });

  it("starts a session only when none is running", async () => {
    const finished = { ...RUNNING, status: "done" as const };
    const { calls, use } = deps({ latest: () => finished });
    const outcome = await sendToGenobi(WORDS, use);
    expect(outcome).toMatchObject({ kind: "started" });
    expect(calls.message).not.toHaveBeenCalled();
    expect(calls.spawn).toHaveBeenCalledWith(WORDS);
    // Closed spawn dialog: nothing started, nothing said as started.
    calls.spawn.mockResolvedValueOnce(undefined as never);
    expect(await sendToGenobi(WORDS, use)).toEqual({ kind: "closed" });
  });

  it("copies to the clipboard when the session has no live transport", async () => {
    const { calls, use } = deps({
      latest: () => RUNNING,
      message: async () => {
        throw new AgentRefusal("No.", "agent_no_live_transport");
      },
    });
    expect(await sendToGenobi(WORDS, use)).toMatchObject({
      kind: "copied",
      copied: true,
    });
    expect(calls.copy).toHaveBeenCalledWith(WORDS.prompt);
    expect(calls.spawn).not.toHaveBeenCalled();
    // A clipboard the page may not write is said plainly.
    calls.copy.mockResolvedValueOnce(false);
    expect(await sendToGenobi(WORDS, use)).toMatchObject({ copied: false });
    expect(copiedText(false)).toMatch(/could not be written/);
    expect(copiedText(true)).toMatch(/^Copied to the clipboard\./);
  });

  it("copies for a relayed session without calling a route the Worker lacks", async () => {
    const relayed = {
      ...RUNNING,
      localSessionUrl: "http://127.0.0.1:4317/?agentSession=x",
    };
    const { calls, use } = deps({ latest: () => relayed });
    expect((await sendToGenobi(WORDS, use)).kind).toBe("copied");
    expect(calls.message).not.toHaveBeenCalled();
    // Before the relay names the local session, the Worker answers 404
    // without a code: copied all the same.
    const early = deps({
      latest: () => ({ ...RUNNING, live: undefined }),
      message: async () => {
        throw new AgentRefusal("This runner action is unavailable.");
      },
    });
    expect((await sendToGenobi(WORDS, early.use)).kind).toBe("copied");
  });

  it("starts a new session when the running one ended meanwhile, and says a finishing one", async () => {
    const ended = deps({
      latest: () => RUNNING,
      message: async () => {
        throw new AgentRefusal("Ended.", "agent_session_ended");
      },
    });
    expect((await sendToGenobi(WORDS, ended.use)).kind).toBe("started");
    const finishing = deps({
      latest: () => RUNNING,
      message: async () => {
        throw new AgentRefusal(
          "That session is finishing. Send again in a moment.",
          "agent_session_finishing",
        );
      },
    });
    await expect(sendToGenobi(WORDS, finishing.use)).rejects.toThrow(
      "That session is finishing",
    );
    expect(finishing.calls.spawn).not.toHaveBeenCalled();
  });
});
