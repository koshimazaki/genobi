/**
 * Additions to the project-prompt contract in `shared/agent-session.ts`,
 * kept apart so that file stays byte-for-byte what both builders copied.
 * Shared by local sessions and the hosted paired-runner relay.
 */
import type { AgentSessionStatus } from "./agent-session";

/**
 * The studio sends this header, with the value "1", on every
 * `/api/agent/*` request. A page on another site cannot add a custom header
 * without a CORS preflight the local server never grants.
 */
export const AGENT_REQUEST_HEADER = "X-Genobi-Agent";

/**
 * The agent's own browser and its Genobi MCP server send this on every
 * request. Its presence marks the request as an agent's, like the session
 * cookie a ticket sets; it can only take spending away, never grant it.
 */
export const AGENT_MARK_HEADER = "X-Genobi-Agent-Session";

/**
 * The Genobi CLI sends this, with the value "cli", and the Genobi MCP server
 * with "mcp", on every request, so a record of who sent something (a World
 * recipe's `from`, a take's `origin`) can say so. Like the mark it only
 * describes the caller; it grants nothing.
 */
export const GENOBI_CLIENT_HEADER = "X-Genobi-Client";

/**
 * The agent's Genobi MCP server sends its session's grant (the
 * `GENOBI_AGENT_RUN` token the server gave the runner) on every request, so
 * the studio knows which session it belongs to: it may read the person's
 * picked takes, quotes under the person's run location and templates, and a
 * quote it takes reaches that session's approvals in the person's studio. It
 * grants no spending: the request is still an agent's.
 */
export const AGENT_RUN_HEADER = "X-Genobi-Agent-Run";
/** A grant: 24 hexadecimal characters. */
export const AGENT_RUN_GRANT = /^[0-9a-f]{24}$/;

/** Paid routes answer this code to an agent's session. */
export const AGENT_SPEND_CODE = "agent_cannot_spend";
export const AGENT_SPEND_MESSAGE =
  "An agent cannot spend. The person approves paid steps in their own studio.";

/** Progress lines kept per session, newest last, and their length. */
export const AGENT_LINES_MAX = 40;
export const AGENT_LINE_CHARS = 300;
export const AGENT_SUMMARY_CHARS = 2000;

/** Conversation entries kept per session (`AgentSession.exchange`). */
export const AGENT_EXCHANGE_MAX = 24;

/**
 * A message for a session whose runner takes no further input (Hermes, a
 * Terminal window, a relayed session): the studio copies the words to the
 * clipboard instead and says so.
 */
export const AGENT_NO_TRANSPORT_CODE = "agent_no_live_transport";
export const AGENT_NO_TRANSPORT_MESSAGE =
  "This session takes no further messages while it runs. Paste the words into its window, or send them once it finishes.";
/** A message for a session that has ended: the studio starts a new one. */
export const AGENT_ENDED_CODE = "agent_session_ended";
/** A message for a session whose input just closed and is still exiting. */
export const AGENT_FINISHING_CODE = "agent_session_finishing";

/** A session the studio should keep polling. */
export const isAgentActive = (status: AgentSessionStatus) =>
  status === "starting" || status === "running";

/** Session ids are UUIDs minted by the server. */
export const AGENT_SESSION_ID = /^[0-9a-f-]{36}$/;
