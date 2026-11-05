// Continue this conversation (issue #58): a new run of the same runner that
// resumes the earlier session's own conversation, rather than a clean start.
// The Genobi session and the runner's process are new identities; what
// carries over is the runner's conversation id (Hermes `--resume <id>`),
// kept on the server only, and the visible exchange. Anything that cannot
// be continued exactly is refused, so the studio holds the words instead of
// quietly starting a new context.
import type { AgentRunner, AgentSessionRequest } from "../shared/agent-session";
import {
  AGENT_CONTINUE_CODE,
  isAgentActive,
} from "../shared/agent-session-events";
import type { Running } from "./agent-session-types";
import { AppError } from "./errors";

const refuse = (message: string) =>
  new AppError(409, message, AGENT_CONTINUE_CODE);

/** What the studio says when a runner kept no conversation to resume. */
export const continueUnavailable = (runner: AgentRunner) =>
  runner === "claude"
    ? "Claude Code keeps no conversation once its run ends, so this one cannot continue. Your words are kept; choose Start new conversation."
    : "Hermes recorded no conversation to resume for that run. Your words are kept; choose Start new conversation.";

/**
 * The earlier session a Continue start resumes, checked against the owner,
 * the runner now set up and the project the start names. Undefined for an
 * ordinary start.
 */
export function continueFrom(
  sessions: ReadonlyMap<string, Running>,
  owner: string,
  request: AgentSessionRequest,
  runner: AgentRunner,
): Running | undefined {
  if (!request.continues) return undefined;
  const earlier = sessions.get(request.continues);
  if (!earlier || earlier.owner !== owner)
    throw refuse(
      "That conversation is no longer kept by this studio. Your words are kept; choose Start new conversation.",
    );
  // Still running: its next message goes to it, not to a second run.
  if (isAgentActive(earlier.view.status))
    throw refuse(
      "That conversation is still running. Send your words to it instead.",
    );
  if (earlier.view.runner !== runner)
    throw refuse(
      "The agent changed since that conversation. Your words are kept; choose Start new conversation.",
    );
  if ((earlier.project ?? "") !== (request.copyId ?? ""))
    throw refuse(
      "That conversation belongs to a different project. Your words are kept; choose Start new conversation.",
    );
  if (!earlier.resumeId) throw refuse(continueUnavailable(runner));
  // Two runs resuming one conversation would fork it.
  if (earlier.continuedBy && sessions.has(earlier.continuedBy))
    throw refuse(
      "That conversation already continued in a newer run. Continue that one instead.",
    );
  return earlier;
}

/** The new run joins the earlier conversation: its exchange and link. */
export function joinConversation(session: Running, earlier: Running) {
  session.view.continues = earlier.view.id;
  earlier.continuedBy = session.view.id;
  // Until the new run names it again, the conversation is the earlier one:
  // a run that fails before answering leaves it resumable.
  if (earlier.resumeId) keepRunnerSession(session, earlier.resumeId);
  if (earlier.view.exchange)
    session.view.exchange = earlier.view.exchange
      .filter((entry) => !entry.pending)
      .map((entry) => ({ ...entry }));
}

/** The runner named its conversation: a later Continue may resume it. */
export function keepRunnerSession(session: Running, id: string) {
  session.resumeId = id;
  session.view.resumable = true;
}
