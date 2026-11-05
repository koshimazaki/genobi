/**
 * Continue this conversation (issue #58): a finished session's conversation
 * goes on in a new run that resumes the runner's own history (Hermes
 * `--resume`), on the same project. No dialog: the runner was already chosen
 * and set up. The server refuses with `agent_continue_unavailable` when it
 * cannot resume exactly, and the caller then holds the words; nothing here
 * falls back to a clean start or retries an uncertain one.
 */
import type {
  AgentMessageRequest,
  AgentRunner,
  AgentSession,
} from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { openCopyId, runnerName } from "../voice/agent-client";
import { startAgentSession } from "./api";
import { followBusy } from "./spawn";
import {
  noteSessionProject,
  sessionProject,
  spawnInFlight,
} from "./spawn-store";
import { showAgentSession } from "./useAgentSession";

/** A conversation the next note can continue: running, or resumable. */
export const continuable = (session: AgentSession | undefined) =>
  !!session &&
  !session.localSessionUrl &&
  (isAgentActive(session.status) || !!session.resumable);

/**
 * The finished conversation an unpinned note continues: the shown one, when
 * it is resumable and known to belong to this project. The voice picker
 * names the same one, so the label and the send agree.
 */
export function implicitConversation(
  shown: AgentSession | undefined,
  projectId: string | undefined,
  project: (id: string) => string | undefined = sessionProject,
) {
  return shown &&
    !isAgentActive(shown.status) &&
    shown.resumable &&
    !shown.localSessionUrl &&
    project(shown.id) === projectId
    ? shown
    : undefined;
}

/** Said when a finished conversation cannot be resumed; the words are kept. */
export const finishedText = (runner: AgentRunner) =>
  runner === "claude"
    ? "That conversation has finished, and Claude Code keeps no conversation once its run ends. Your transcript is kept; choose Start new conversation."
    : `That conversation has finished and ${runnerName(runner)} recorded nothing to resume. Your transcript is kept; choose Start new conversation.`;

export const SPAWNING =
  "An agent is already being started. Wait for setup to finish, then send this transcript.";

/** Starts the run that continues `earlier`; throws a sentence safe to show. */
export async function continueSession(
  earlier: AgentSession,
  request: AgentMessageRequest,
  projectId: string | undefined,
): Promise<AgentSession> {
  if (!earlier.resumable) throw new Error(finishedText(earlier.runner));
  if (spawnInFlight()) throw new Error(SPAWNING);
  const copyId = await openCopyId(projectId);
  const session = await startAgentSession({
    prompt: request.prompt,
    source: request.source,
    continues: earlier.id,
    ...(copyId ? { copyId } : {}),
  }).catch((error: unknown) => followBusy(error));
  // The server answers 201 for a run that could not begin.
  if (session.status === "failed")
    throw new Error(
      session.summary ??
        "The conversation could not continue. Your transcript is kept.",
    );
  if (projectId) noteSessionProject(session.id, projectId);
  showAgentSession(session);
  return session;
}
