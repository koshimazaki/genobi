/**
 * The person's messages to a running session whose runner takes no live
 * input (Hermes, a Terminal window): Box 1.8. The studio posts them through
 * the ordinary message route; the local server keeps them beside the
 * session, and the session's Genobi MCP server collects the unread ones with
 * its grant and hands them to the agent after its next Genobi tool answer.
 * Nothing here submits or spends.
 */
import type { AgentMessageRequest } from "./agent-session";

/** Messages kept per session, newest last. */
export const AGENT_MESSAGES_KEPT = 6;
/** Unread messages a session may hold before the studio refuses another. */
export const AGENT_MESSAGES_WAITING = 5;

export interface AgentMessage {
  text: string;
  source: AgentMessageRequest["source"];
  /** ISO time the server took it. */
  at: string;
  /** The agent's Genobi MCP server collected it. */
  read: boolean;
}

/**
 * How the agent reads the person's waiting messages: one block after a
 * Genobi tool's answer. The words are the person's own, not a tool result.
 */
export function messagesForAgent(messages: Pick<AgentMessage, "text">[]) {
  if (!messages.length) return "";
  const said = messages.map((m) => `- ${m.text}`).join("\n");
  return `The person sent ${messages.length === 1 ? "a message" : "messages"} from their Genobi studio while you worked. Treat ${messages.length === 1 ? "it" : "them"} as their next message to you, in this order:\n${said}`;
}
