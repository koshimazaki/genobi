/**
 * Where the person's words go (Box 1.8): to the session that is running, as
 * its next message, and only with none running to a new session through the
 * one spawn action (`spawnFromStudio`). A runner that takes no further input
 * (Hermes, a Terminal window, a session relayed from the hosted studio) is
 * sent nothing: the words go to the clipboard and the caller says so.
 * Nothing here pushes the project copy; the agent's own edits stay its own.
 */
import type {
  AgentMessageRequest,
  AgentSession,
} from "../../shared/agent-session";
import {
  AGENT_ENDED_CODE,
  AGENT_NO_TRANSPORT_CODE,
  AGENT_NO_TRANSPORT_MESSAGE,
  isAgentActive,
} from "../../shared/agent-session-events";
import { AgentRefusal, readActiveSession, sendAgentMessage } from "./api";
import { spawnFromStudio } from "./spawn-store";
import { latestAgentSession, showAgentSession } from "./useAgentSession";

export type SendOutcome =
  /** Handed to the running session as its next turn. */
  | { kind: "sent"; session: AgentSession }
  /** No session was running: a new one started with these words. */
  | { kind: "started"; session: AgentSession }
  /** The running session takes no further input: copied (or not) instead. */
  | { kind: "copied"; session: AgentSession; copied: boolean }
  /** The person closed the spawn dialog; nothing started. */
  | { kind: "closed" };

/** Writes the words to the clipboard; false when the page may not. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** What the studio says for a copy in place of a message. */
export const copiedText = (copied: boolean) =>
  copied
    ? `Copied to the clipboard. ${AGENT_NO_TRANSPORT_MESSAGE}`
    : "This session takes no further messages while it runs, and the clipboard could not be written. Select the words and copy them by hand.";

export interface SendDeps {
  latest: () => AgentSession | undefined;
  active: () => Promise<AgentSession | undefined>;
  message: typeof sendAgentMessage;
  spawn: (request: AgentMessageRequest) => Promise<AgentSession | undefined>;
  show: (session: AgentSession) => void;
  copy: (text: string) => Promise<boolean>;
}
const live: SendDeps = {
  latest: latestAgentSession,
  active: readActiveSession,
  message: sendAgentMessage,
  spawn: spawnFromStudio,
  show: showAgentSession,
  copy: copyText,
};

/** Sends the words; throws an Error whose message is safe to show. */
export async function sendToGenobi(
  request: AgentMessageRequest,
  deps: Partial<SendDeps> = {},
): Promise<SendOutcome> {
  const use = { ...live, ...deps };
  const known = use.latest();
  // After a reload the page may not know the running session yet.
  const running =
    known && isAgentActive(known.status) ? known : await use.active();
  if (running && isAgentActive(running.status)) {
    const outcome = await deliver(running, request, use);
    if (outcome) return outcome;
  }
  const session = await use.spawn(request);
  return session ? { kind: "started", session } : { kind: "closed" };
}

/** The message, or the clipboard; undefined when the session has ended. */
async function deliver(
  session: AgentSession,
  request: AgentMessageRequest,
  use: SendDeps,
): Promise<SendOutcome | undefined> {
  const copy = async (): Promise<SendOutcome> => {
    use.show(session);
    return { kind: "copied", session, copied: await use.copy(request.prompt) };
  };
  // A relayed session's runner is on another machine: no message route.
  if (session.localSessionUrl) return copy();
  try {
    const next = await use.message(session.id, request);
    use.show(next);
    return { kind: "sent", session: next };
  } catch (error) {
    if (!(error instanceof AgentRefusal)) throw error;
    // The hosted relay has no message route and answers without a code.
    if (
      error.code === AGENT_NO_TRANSPORT_CODE ||
      (error.code === undefined && !session.live)
    )
      return copy();
    // It ended between the last read and now: start a new one.
    if (
      error.code === AGENT_ENDED_CODE ||
      error.code === "agent_session_missing"
    )
      return undefined;
    throw error;
  }
}
