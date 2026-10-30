// Box 1.8: a message for a running session whose runner takes no live input
// (Hermes here; a Terminal window the same way). The message route queues
// it, pending in the conversation; the session's Genobi MCP server (its mark
// and grant) collects the unread ones once each and hands them to the agent
// after its next tool answer. Messages never collected are said to be
// unread when the session ends. Fake Hermes only: no real agent, no
// provider, nothing paid.
import { describe, expect, it } from "vitest";
import { GenobiApi } from "../mcp/api";
import { withMessages } from "../mcp/server";
import { AgentInbox } from "../server/agent-inbox";
import type { AgentSessions } from "../server/agent-sessions";
import type { AgentSession } from "../shared/agent-session";
import {
  AGENT_MESSAGES_WAITING,
  messagesForAgent,
} from "../shared/agent-messages";
import { pendingNote } from "../src/agent/AgentConversation";
import { agentStudio, fakeHermesConfig } from "./agent-harness";

/** The grant the server gave this session's runner (its MCP config holds it). */
const grantOf = (agents: AgentSessions, id: string) =>
  (
    agents as unknown as {
      sessions: Map<string, { grant?: string }>;
    }
  ).sessions.get(id)!.grant!;

type Studio = Awaited<ReturnType<typeof agentStudio>>;

/** A person with a running fake Hermes session in `studio`. */
async function person(studio: Studio) {
  const cookie = await studio.fresh();
  const started = await studio.start(cookie, "hang here");
  const id = started.body.id as string;
  const say = (prompt: string) =>
    studio.call(cookie, `/sessions/${id}/messages`, {
      method: "POST",
      body: { prompt, source: "voice" },
    });
  /** The session's Genobi MCP server, as the runner starts it. */
  const mcp = new GenobiApi(
    new URL(`${studio.base}/`),
    fetch,
    true,
    grantOf(studio.agents, id),
  );
  const read = async () =>
    (await studio.call(cookie, `/sessions/${id}`)).body as AgentSession;
  const stop = async () => {
    await studio.call(cookie, `/sessions/${id}/stop`, { method: "POST" });
    return studio.settle(cookie, id);
  };
  return { cookie, id, say, mcp, read, stop };
}

async function running() {
  const studio = await agentStudio({
    config: await fakeHermesConfig(),
    sampleMs: 50,
  });
  return { studio, ...(await person(studio)) };
}

describe("a message for a session without live input", () => {
  it("is pending in the conversation until the agent collects it, once", async () => {
    const { say, mcp, read, stop } = await running();
    expect((await say("Make the drop slower")).status).toBe(202);
    expect((await read()).exchange?.at(-1)).toMatchObject({
      from: "person",
      text: "Make the drop slower",
      pending: true,
    });
    // The agent's next Genobi tool answer carries it, once.
    const answer = await withMessages(mcp, {
      content: [{ type: "text", text: "{}" }],
    });
    expect(answer.content).toHaveLength(2);
    expect(answer.content[1]).toMatchObject({
      type: "text",
      text: expect.stringContaining("- Make the drop slower"),
    });
    expect(await mcp.messages()).toEqual([]);
    expect((await read()).exchange?.at(-1)?.pending).toBeUndefined();
    await stop();
  });

  it("one never collected is said to be unread when the session ends", async () => {
    const { say, stop } = await running();
    await say("Too late for it");
    const ended = await stop();
    expect(ended.lines).toContain(
      "1 message was not read before the session ended.",
    );
    expect(ended.exchange?.at(-1)?.pending).toBe(true);
    expect(pendingNote(ended)).toBe("Not read before the session ended.");
  });

  it("refuses past five unread, and a stopped session takes none", async () => {
    const { say, stop } = await running();
    for (let i = 0; i < AGENT_MESSAGES_WAITING; i++)
      expect((await say(`note ${i}`)).status).toBe(202);
    const full = await say("one more");
    expect(full.status).toBe(429);
    expect(full.body.code).toBe("agent_messages_waiting");
    const ended = await stop();
    expect(ended.lines).toContain(
      `${AGENT_MESSAGES_WAITING} messages were not read before the session ended.`,
    );
    expect((await say("too late")).body.code).toBe("agent_session_ended");
  });
});

describe("who collects", () => {
  it("needs the agent's mark; an unknown grant or none collects nothing", async () => {
    const { studio, say, stop } = await running();
    await say("for my agent");
    const plain = await fetch(`${studio.base}/api/agent/run/messages`, {
      method: "POST",
    });
    expect(plain.status).toBe(403);
    const unknown = new GenobiApi(
      new URL(`${studio.base}/`),
      fetch,
      true,
      "0123456789abcdef01234567",
    );
    expect(await unknown.messages()).toEqual([]);
    // Not a studio-started session: no request at all.
    expect(
      await new GenobiApi(new URL(`${studio.base}/`), fetch).messages(),
    ).toEqual([]);
    await stop();
  });

  it("another person's live grant collects only its own session's messages", async () => {
    const { studio, say, mcp, stop } = await running();
    const other = await person(studio);
    await say("for the first agent");
    await other.say("for the second agent");
    expect((await other.mcp.messages()).map((m) => m.text)).toEqual([
      "for the second agent",
    ]);
    expect((await mcp.messages()).map((m) => m.text)).toEqual([
      "for the first agent",
    ]);
    await other.stop();
    await stop();
  });

  it("an ended session's grant collects nothing from the owner's next session", async () => {
    const studio = await agentStudio({
      config: await fakeHermesConfig(),
      sampleMs: 50,
    });
    const first = await person(studio);
    await first.stop();
    // The same person starts again and sends to the new session.
    const started = await studio.start(first.cookie, "hang again");
    const next = started.body.id as string;
    await studio.call(first.cookie, `/sessions/${next}/messages`, {
      method: "POST",
      body: { prompt: "for the new agent", source: "voice" },
    });
    expect(await first.mcp.messages()).toEqual([]);
    const current = new GenobiApi(
      new URL(`${studio.base}/`),
      fetch,
      true,
      grantOf(studio.agents, next),
    );
    expect((await current.messages()).map((m) => m.text)).toEqual([
      "for the new agent",
    ]);
    await studio.call(first.cookie, `/sessions/${next}/stop`, {
      method: "POST",
    });
    await studio.settle(first.cookie, next);
  });
});

describe("the inbox and the agent's wording", () => {
  it("keeps unread messages, drops read ones past six, and is per session", () => {
    const inbox = new AgentInbox();
    inbox.post("a", "one", "voice");
    inbox.post("b", "other", "typed");
    expect(inbox.take("a").map((m) => m.text)).toEqual(["one"]);
    expect(inbox.take("a")).toEqual([]);
    for (let i = 0; i < 5; i++) inbox.post("a", `n${i}`, "voice");
    expect(() => inbox.post("a", "full", "voice")).toThrow();
    expect(inbox.drop("a")).toBe(5);
    expect(inbox.take("a")).toEqual([]);
    expect(inbox.take("b").map((m) => m.source)).toEqual(["typed"]);
  });

  it("names the words as the person's next message, in order", () => {
    expect(messagesForAgent([])).toBe("");
    expect(messagesForAgent([{ text: "one" }, { text: "two" }])).toMatch(
      /next message to you, in this order:\n- one\n- two$/,
    );
  });
});
