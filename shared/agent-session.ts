/**
 * The project prompt (issue #23, "One global prompt"): what the person wants
 * done, handed from the studio to a local agent session (Claude Code or
 * Hermes) that works on the open project through the Genobi tools. Local
 * execution; the hosted studio can relay it to an explicitly paired local server.
 */

import { COPY_ID, DIRECTOR_ID } from "./director/commands";
import type { AgentApproval, ApprovalResult } from "./agent-approval";
import { parseAgentContext, type AgentContext } from "./agent-context";

export const AGENT_RUNNERS = ["claude", "hermes"] as const;
export type AgentRunner = (typeof AGENT_RUNNERS)[number];

export const AGENT_PROMPT_MAX = 4000;

/**
 * Where a session runs: `headless` in the studio's bubble, or `terminal`, a
 * Terminal window the person watches and can type into while the bubble
 * follows its approvals (docs/agent-setup.md, "Spawn the agent").
 */
export const AGENT_SESSION_MODES = ["headless", "terminal"] as const;
export type AgentSessionMode = (typeof AGENT_SESSION_MODES)[number];

export interface AgentSessionRequest {
  /** What the person wants done, as spoken or typed. */
  prompt: string;
  /**
   * The open Director project, when one is open: its id, as the person's own
   * studio knows it, or a copy handle (`id.xxxxxxxxxx`) the person owns.
   */
  copyId?: string;
  source: "voice" | "typed";
  /**
   * The person's recent picks and the composer's settings
   * (`shared/agent-context.ts`), so "my last two picks" and "these settings"
   * reach the agent as real ids. Optional: a typed or older request has none.
   */
  context?: AgentContext;
  /**
   * Setup's last step started this session (`shared/agent-setup.ts`): the
   * server adds its own setup facts to the brief. Only `true`; the page sends
   * no facts of its own.
   */
  setup?: true;
  /** `headless` when absent; `terminal` only from the local studio. */
  mode?: AgentSessionMode;
  /**
   * Terminal only: the studio read the harness as signed out, so the window
   * runs its sign-in first and then the chat (Hermes; Claude Code asks for
   * its own login in the window). Only `true`.
   */
  signIn?: true;
}

export type AgentSessionStatus =
  | "starting"
  | "running"
  | "waiting"
  | "done"
  | "failed"
  | "stopped"
  | "interrupted";

export interface AgentSession {
  /** Paired runner handoff; only an http loopback origin and local session UUID. */
  localSessionUrl?: string;
  id: string;
  runner: AgentRunner;
  status: AgentSessionStatus;
  prompt: string;
  startedAt: string;
  /** The agent's last short account of what it did or needs. */
  summary?: string;
  /** Recent progress lines, newest last, for the studio to show. */
  lines: string[];
  /**
   * Paid steps the agent quoted, newest last, for the person to approve or
   * decline (`shared/agent-approval.ts`). Absent when there are none.
   */
  approvals?: AgentApproval[];
  /**
   * Every approval that started a run or became uncertain, by quote id, even
   * once its step has left `approvals`. Absent when there are none.
   */
  results?: ApprovalResult[];
  /**
   * The conversation, oldest first: the first prompt and each message the
   * person sent (`POST …/messages`), and each reply the runner gave at the
   * end of a turn. Absent from an older server.
   */
  exchange?: AgentExchange[];
  /**
   * The running session takes further messages: its runner's input stays
   * open (headless Claude Code). Absent for Hermes, a Terminal window and a
   * relayed session, whose words go to the clipboard instead.
   */
  live?: true;
  /** Its last turn is over and it waits for the person's next message. */
  idle?: true;
}

/** One entry of a session's conversation, as the server recorded it. */
export interface AgentExchange {
  from: "person" | "agent";
  text: string;
  at: string;
  /**
   * A message queued for a runner without live input (Box 1.8) that its
   * Genobi MCP server has not collected yet.
   */
  pending?: boolean;
}

/** A further message for a running session (`POST …/messages`). */
export interface AgentMessageRequest {
  prompt: string;
  source: "voice" | "typed";
}

/** What GET /api/agent/status answers: booleans and names only, never paths. */
export interface AgentRunnerStatus {
  available: boolean;
  /** Present on the hosted relay, including false before a runner is paired. */
  paired?: boolean;
  runner?: AgentRunner;
  message?: string;
  /** What setup can do about it: set up Hermes' `genobi` profile. */
  setup?: "hermes-profile";
  /** This server can open a session in a Terminal window (macOS). */
  terminal?: boolean;
}

const strip = (text: string) => text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");

/** The person's words, as a start or a message takes them. */
function promptText(prompt: unknown) {
  if (typeof prompt !== "string") throw new Error("Say what you want done.");
  const text = strip(prompt).trim();
  if (!text) throw new Error("Say what you want done.");
  if (text.length > AGENT_PROMPT_MAX)
    throw new Error(`Keep the prompt under ${AGENT_PROMPT_MAX} characters.`);
  return text;
}

/**
 * Validates a further message for a running session with the start's rules
 * (length, control characters, source); throws a sentence safe to show.
 */
export function parseAgentMessage(value: unknown): AgentMessageRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Send a JSON object with a prompt.");
  const { prompt, source, ...rest } = value as Record<string, unknown>;
  const text = promptText(prompt);
  if (source !== "voice" && source !== "typed")
    throw new Error("Say whether the prompt was spoken or typed.");
  if (Object.keys(rest).length)
    throw new Error("A message carries only its prompt and source.");
  return { prompt: text, source };
}

/** Validates a request body; throws an Error whose message is safe to show. */
export function parseAgentSessionRequest(value: unknown): AgentSessionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Send a JSON object with a prompt.");
  const { prompt, copyId, source, context, setup, mode, signIn } =
    value as Record<string, unknown>;
  const text = promptText(prompt);
  if (
    copyId !== undefined &&
    (typeof copyId !== "string" ||
      !(DIRECTOR_ID.test(copyId) || COPY_ID.test(copyId)))
  )
    throw new Error("That project copy id is not valid.");
  if (source !== "voice" && source !== "typed")
    throw new Error("Say whether the prompt was spoken or typed.");
  if (setup !== undefined && setup !== true)
    throw new Error("Mark a setup start with true, and nothing else.");
  if (
    mode !== undefined &&
    !(AGENT_SESSION_MODES as readonly unknown[]).includes(mode)
  )
    throw new Error("Run the session headless or in a terminal.");
  if (signIn !== undefined && (signIn !== true || mode !== "terminal"))
    throw new Error("Only a Terminal start signs in first, marked true.");
  return {
    prompt: text,
    ...(copyId ? { copyId } : {}),
    source,
    ...(context === undefined ? {} : { context: parseAgentContext(context) }),
    ...(setup ? { setup: true as const } : {}),
    ...(mode === "terminal" ? { mode: "terminal" as const } : {}),
    ...(signIn ? { signIn: true as const } : {}),
  };
}
