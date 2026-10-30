// Box 1.8: a second message goes to the running session. The route's
// validation and ownership, the long-lived Claude Code runner (stdin stays
// open, one stream-JSON user turn per message, closed after an idle wait),
// the conversation the view records, and, for a runner that takes no further
// input (Hermes, a Terminal window), the MCP inbox through the route or
// `agent_no_live_transport` without one.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeInput,
  deliver,
  openInput,
  turnEnded,
} from "../server/agent-conversation";
import { launch, userTurn } from "../server/agent-runner";
import type { Running } from "../server/agent-session-types";
import { AgentSessions } from "../server/agent-sessions";
import type { AgentTerminal } from "../server/agent-terminal";
import type { AgentSession } from "../shared/agent-session";
import { parseAgentMessage } from "../shared/agent-session";
import { agentStudio, fakeConfig, fakeHermesConfig } from "./agent-harness";

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true });
});

const message = (prompt: unknown, source: unknown = "voice") => ({
  method: "POST",
  body: { prompt, source },
});

/** Polls the session until `ready` holds. */
async function until(
  studio: Awaited<ReturnType<typeof agentStudio>>,
  cookie: string,
  id: string,
  ready: (view: AgentSession) => boolean,
) {
  for (let i = 0; i < 200; i++) {
    const { body } = await studio.call(cookie, `/sessions/${id}`);
    if (ready(body)) return body as AgentSession;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The session never got there.");
}

describe("a further message", { timeout: 20_000 }, () => {
  it("validates like a start: words, length, control characters, source", () => {
    expect(
      parseAgentMessage({ prompt: " Cut\x07 it ", source: "voice" }),
    ).toEqual({ prompt: "Cut it", source: "voice" });
    for (const bad of [
      null,
      [],
      "Cut it",
      { prompt: "", source: "voice" },
      { prompt: "\x01\x02", source: "typed" },
      { prompt: "x".repeat(4001), source: "typed" },
      { prompt: "Cut", source: "said" },
      { prompt: "Cut", source: "typed", copyId: "house-template" },
    ])
      expect(() => parseAgentMessage(bad)).toThrow();
  });

  it("reaches the running Claude Code session as its next turn, and the view grows", async () => {
    const studio = await agentStudio({ idleMs: 1500 });
    const cookie = await studio.fresh();
    const { body: started } = await studio.start(cookie, "say: First reply");
    expect(started.live).toBe(true);
    const first = await until(studio, cookie, started.id, (v) => !!v.idle);
    expect(first.status).toBe("running");
    expect(first.exchange?.map((e) => [e.from, e.text])).toEqual([
      ["person", "say: First reply"],
      ["agent", "First reply"],
    ]);
    const sent = await studio.call(
      cookie,
      `/sessions/${started.id}/messages`,
      message("say: Second reply"),
    );
    expect(sent.status).toBe(202);
    expect(sent.body.idle).toBeUndefined();
    expect(sent.body.exchange.at(-1)).toMatchObject({
      from: "person",
      text: "say: Second reply",
    });
    const second = await until(
      studio,
      cookie,
      started.id,
      (v) => v.exchange?.length === 4,
    );
    expect(second.exchange?.map((e) => [e.from, e.text])).toEqual([
      ["person", "say: First reply"],
      ["agent", "First reply"],
      ["person", "say: Second reply"],
      ["agent", "Second reply"],
    ]);
    expect(second.summary).toBe("Second reply");
    // No message within the idle wait: the input closes, the runner exits.
    const done = await studio.settle(cookie, started.id);
    expect(done).toMatchObject({ status: "done", summary: "Second reply" });
    expect(done.live).toBeUndefined();
    expect(
      await studio.call(
        cookie,
        `/sessions/${started.id}/messages`,
        message("Too late"),
      ),
    ).toMatchObject({ status: 409, body: { code: "agent_session_ended" } });
  });

  it("is refused before it reaches the runner: shape, owner, header, an agent", async () => {
    const studio = await agentStudio({ idleMs: 5000 });
    const owner = await studio.fresh();
    const other = await studio.fresh();
    const { body } = await studio.start(owner, "hang here");
    const route = `/sessions/${body.id}/messages`;
    expect(await studio.call(owner, route, message(""))).toMatchObject({
      status: 400,
      body: { code: "agent_request", error: "Say what you want done." },
    });
    expect(
      (await studio.call(owner, route, message("x".repeat(4001)))).status,
    ).toBe(400);
    expect(
      (await studio.call(owner, route, message("Go", "shouted"))).status,
    ).toBe(400);
    // Another studio session's id reads as not found, as every route does.
    expect(await studio.call(other, route, message("Go"))).toMatchObject({
      status: 404,
      body: { code: "agent_session_missing" },
    });
    expect(
      (await studio.call(owner, "/sessions/not-an-id/messages", message("Go")))
        .status,
    ).toBe(404);
    expect(
      (
        await studio.call(owner, route, {
          ...message("Go"),
          headers: { "X-Genobi-Agent": "" },
        })
      ).body.code,
    ).toBe("agent_cross_site");
    expect(
      (
        await studio.call(owner, route, {
          ...message("Go"),
          headers: { "X-Genobi-Agent-Session": "1" },
        })
      ).body.code,
    ).toBe("agent_nested");
    await studio.call(owner, `/sessions/${body.id}/stop`, { method: "POST" });
    expect((await studio.settle(owner, body.id)).status).toBe("stopped");
  });

  it("has no live transport into Hermes: the route queues it for its MCP server", async () => {
    const studio = await agentStudio({
      config: await fakeHermesConfig(),
      sampleMs: 50,
    });
    const cookie = await studio.fresh();
    const { body } = await studio.start(cookie, "hang here");
    expect(body.live).toBeUndefined();
    // Nothing is written to its stdin; the message waits for the agent's
    // next Genobi tool call (tests/agent-session-inbox.test.ts).
    expect(
      await studio.call(
        cookie,
        `/sessions/${body.id}/messages`,
        message("And another thing"),
      ),
    ).toMatchObject({ status: 202 });
    const view = (await studio.call(cookie, `/sessions/${body.id}`)).body;
    expect(view.exchange).toHaveLength(2);
    expect(view.exchange[1]).toMatchObject({
      from: "person",
      text: "And another thing",
    });
    await studio.call(cookie, `/sessions/${body.id}/stop`, { method: "POST" });
    expect((await studio.settle(cookie, body.id)).status).toBe("stopped");
  });

  it("has no live transport into a Terminal window either", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-terminal-"));
    folders.push(folder);
    const terminal: AgentTerminal = {
      supported: true,
      agentFolder: (id) => path.join(folder, id),
      openAgent: vi.fn(async (id) => ({
        statusFile: path.join(folder, id, "status.json"),
      })),
    };
    const sessions = new AgentSessions({
      config: await fakeConfig(),
      studioOrigin: "http://127.0.0.1:4431",
      link: () => ({ code: "LINK2345" }),
      launch: vi.fn(() => ({ pid: undefined })),
      terminal,
    });
    const view = await sessions.start("owner", {
      prompt: "Cut the drop",
      source: "typed",
      mode: "terminal",
    });
    expect(view.status).toBe("running");
    expect(() => sessions.message(view.id, "owner", "More")).toThrow(
      expect.objectContaining({ code: "agent_no_live_transport" }),
    );
    sessions.stop(view.id, "owner");
    await sessions.close();
  });
});

describe("the long-lived runner", () => {
  it("writes each turn as one stream-JSON line and keeps stdin open until closed", async () => {
    // A child that echoes its stdin, standing in for Claude Code.
    const lines: string[] = [];
    let exited: number | null | undefined;
    const child = launch(
      {
        command: process.execPath,
        args: ["-e", "process.stdin.pipe(process.stdout)"],
        cwd: os.tmpdir(),
        env: { PATH: process.env.PATH ?? "" },
        stdin: 'Cut it "now"',
        turns: "stream",
      },
      {
        line: (raw) => lines.push(raw),
        exit: (code) => (exited = code),
        error: () => {},
      },
    );
    await vi.waitFor(() => expect(lines).toHaveLength(1));
    expect(JSON.parse(lines[0])).toEqual({
      type: "user",
      message: { role: "user", content: 'Cut it "now"' },
      parent_tool_use_id: null,
    });
    expect(exited).toBeUndefined();
    child.stdin!.write(userTurn("Second\nline"));
    await vi.waitFor(() => expect(lines).toHaveLength(2));
    expect(JSON.parse(lines[1]).message.content).toBe("Second\nline");
    child.stdin!.end();
    await vi.waitFor(() => expect(exited).toBe(0));
  });

  it("closes its input after the idle wait, and a message resets the wait", async () => {
    vi.useFakeTimers();
    try {
      const input = { write: vi.fn(), end: vi.fn() };
      const session = {
        view: { status: "running", lines: [] },
      } as unknown as Running;
      openInput(session, input as never, 1000);
      turnEnded(session);
      expect(session.view.idle).toBe(true);
      vi.advanceTimersByTime(900);
      session.finished = "done";
      deliver(session, "Again");
      expect(input.write).toHaveBeenCalledWith(userTurn("Again"));
      expect(session.view.idle).toBeUndefined();
      // The new turn decides how the session ends.
      expect(session.finished).toBeUndefined();
      vi.advanceTimersByTime(5000);
      expect(input.end).not.toHaveBeenCalled();
      turnEnded(session);
      vi.advanceTimersByTime(1000);
      expect(input.end).toHaveBeenCalledOnce();
      expect(session.view.live).toBeUndefined();
      // Closed but still running: finishing, not a missing transport.
      expect(() => deliver(session, "Late")).toThrow(
        expect.objectContaining({ code: "agent_session_finishing" }),
      );
      closeInput(session);
      expect(input.end).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
