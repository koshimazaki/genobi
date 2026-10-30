// The person's messages to a running session without live input (Box 1.8),
// held in memory beside the sessions. The message route queues them
// (`deliver` in server/agent-conversation.ts records each in the session's
// conversation too); the session's Genobi MCP server collects the unread
// ones with its grant (`take`). Bounded per session and in sessions kept;
// never persisted and never logged.
import {
  AGENT_MESSAGES_KEPT,
  AGENT_MESSAGES_WAITING,
  type AgentMessage,
} from "../shared/agent-messages";
import { pushLine } from "./agent-session-end";
import type { Running } from "./agent-session-types";
import { AppError } from "./errors";

/** Sessions whose messages are kept, oldest dropped first. */
const SESSIONS_KEPT = 32;

export class AgentInbox {
  private boxes = new Map<string, AgentMessage[]>();

  /** Adds the person's message; refused while too many wait unread. */
  post(session: string, text: string, source: AgentMessage["source"]) {
    const box = this.boxes.get(session) ?? [];
    if (box.filter((m) => !m.read).length >= AGENT_MESSAGES_WAITING)
      throw new AppError(
        429,
        "The agent has not read your last messages yet. Wait for its next step, or type in its window.",
        "agent_messages_waiting",
      );
    const message: AgentMessage = {
      text,
      source,
      at: new Date().toISOString(),
      read: false,
    };
    // Unread messages are never dropped; read ones go past the kept few.
    const next = [...box, message];
    while (next.length > AGENT_MESSAGES_KEPT && next[0].read) next.shift();
    this.boxes.delete(session);
    this.boxes.set(session, next);
    for (const key of this.boxes.keys()) {
      if (this.boxes.size <= SESSIONS_KEPT) break;
      this.boxes.delete(key);
    }
    return message;
  }

  /** The agent collects what waits: each message once, oldest first. */
  take(session: string) {
    const unread = (this.boxes.get(session) ?? []).filter((m) => !m.read);
    for (const message of unread) message.read = true;
    return unread.map(({ text, source, at }) => ({ text, source, at }));
  }

  /** Forgets a session's box; answers how many it held unread. */
  drop(session: string) {
    const unread = (this.boxes.get(session) ?? []).filter((m) => !m.read);
    this.boxes.delete(session);
    return unread.length;
  }
}

/**
 * The agent's MCP server collects the session's queued messages: each once,
 * and the conversation's entries for them stop being pending.
 */
export function collectQueued(session: Running, inbox: AgentInbox) {
  const taken = inbox.take(session.view.id);
  if (taken.length)
    for (const entry of session.view.exchange ?? []) delete entry.pending;
  return taken;
}

/**
 * The session ended: messages the agent never collected are said to be
 * unread (their entries stay pending), and the box goes.
 */
export function dropQueued(session: Running, inbox: AgentInbox) {
  const unread = inbox.drop(session.view.id);
  if (unread)
    pushLine(
      session,
      `${unread} ${unread === 1 ? "message was" : "messages were"} not read before the session ended.`,
    );
}
