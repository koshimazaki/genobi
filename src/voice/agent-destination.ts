import {
  AGENT_ENDED_CODE,
  isAgentActive,
} from "../../shared/agent-session-events";
import {
  parseAgentMessage,
  type AgentMessageRequest,
  type AgentSession,
} from "../../shared/agent-session";
import {
  AgentRefusal,
  readActiveSession,
  readAgentSession,
  sendAgentMessage,
} from "../agent/api";
import {
  continueSession,
  finishedText,
  implicitConversation,
  SPAWNING,
} from "../agent/continue";
import { sendToGenobi, type SendOutcome } from "../agent/send";
import {
  sessionProject,
  spawnFromStudio,
  spawnInFlight,
} from "../agent/spawn-store";
import {
  latestAgentSession,
  showAgentSession,
  OPEN_DECK,
} from "../agent/useAgentSession";
import { studioStore } from "../studio/store";
import type { VoiceAgentTarget, VoiceRouting } from "./destination-store";

export const voiceProjectId = () =>
  studioStore.getState().director.bundle?.project.id;
export interface VoiceAgentDeps {
  project: () => string | undefined;
  read: typeof readAgentSession;
  active: typeof readActiveSession;
  latest: typeof latestAgentSession;
  message: typeof sendAgentMessage;
  spawn: typeof spawnFromStudio;
  spawning: typeof spawnInFlight;
  sessionProject: typeof sessionProject;
  show: (session: AgentSession) => void;
  /** Continue a finished conversation in a new run (`src/agent/continue.ts`). */
  resume: typeof continueSession;
}
const deps: VoiceAgentDeps = {
  project: voiceProjectId,
  read: readAgentSession,
  active: readActiveSession,
  latest: latestAgentSession,
  message: sendAgentMessage,
  spawn: spawnFromStudio,
  spawning: spawnInFlight,
  sessionProject,
  show: showAgentSession,
  resume: continueSession,
};

/**
 * Where one voice note goes (issues #28, #58). Start new conversation always
 * spawns a clean context. Continue sends to the selected conversation while
 * it runs, resumes it in a new run once it has finished, and otherwise holds
 * the words: it never falls through to a different session, a prompt or a
 * clean start the label did not name.
 */
export async function sendVoiceToAgent(
  words: string,
  projectId: string | undefined,
  target?: VoiceAgentTarget,
  overrides: Partial<VoiceAgentDeps> = {},
  conversation: VoiceRouting["conversation"] = undefined,
): Promise<SendOutcome> {
  const use = { ...deps, ...overrides };
  const request = parseAgentMessage({ prompt: words, source: "voice" });
  const guard = () => {
    if (
      use.project() !== projectId ||
      (target && target.projectId !== projectId) ||
      (target &&
        use.sessionProject(target.session.id) !== undefined &&
        use.sessionProject(target.session.id) !== projectId)
    )
      throw new Error(
        "The open project changed. Choose the agent destination again before sending.",
      );
  };
  guard();
  const resume = (ended: AgentSession) =>
    resumeEnded(ended, request, projectId, use, guard);
  if (conversation === "new") {
    if (use.spawning()) throw new Error(SPAWNING);
    const session = await use.spawn(request);
    return session ? { kind: "started", session } : { kind: "closed" };
  }
  if (target)
    return continueSelected(target.session.id, request, projectId, use, guard);
  const shown = implicitConversation(
    use.latest(),
    projectId,
    use.sessionProject,
  );
  if (shown) return started(await resume(await fresh(shown.id, use, guard)));
  const currentSession = (session: AgentSession | undefined) => {
    if (!session || !isAgentActive(session.status)) return undefined;
    const linked = use.sessionProject(session.id);
    if (linked !== undefined) return linked === projectId ? session : undefined;
    if (projectId !== undefined) {
      use.show(session);
      throw new Error(
        "This conversation's project is unknown. Choose Shown conversation or use Speak to agent in its log before sending.",
      );
    }
    return session;
  };
  let reached: string | undefined;
  return sendToGenobi(request, {
    latest: () => {
      guard();
      return currentSession(use.latest());
    },
    active: async () => {
      const value = await use.active();
      guard();
      return currentSession(value);
    },
    message: (id, message) => {
      guard();
      reached = id;
      return use.message(id, message);
    },
    spawn: async (message) => {
      guard();
      // The running conversation ended before the words reached it:
      // continue it, never a clean start in its place.
      if (reached) return resume(await fresh(reached, use, guard));
      if (use.spawning()) throw new Error(SPAWNING);
      return use.spawn(message);
    },
    show: use.show,
  });
}

async function fresh(id: string, use: VoiceAgentDeps, guard: () => void) {
  const session = await use.read(id);
  guard();
  return session;
}

/** The selected conversation: its next message, or its continuation. */
async function continueSelected(
  id: string,
  request: AgentMessageRequest,
  projectId: string | undefined,
  use: VoiceAgentDeps,
  guard: () => void,
): Promise<SendOutcome> {
  let session = await fresh(id, use, guard);
  if (session.localSessionUrl)
    throw new Error(
      "This conversation takes messages in its local studio. Open the local session or copy the transcript.",
    );
  if (isAgentActive(session.status)) {
    try {
      const next = await use.message(session.id, request);
      use.show(next);
      window.dispatchEvent(new Event(OPEN_DECK));
      return { kind: "sent", session: next };
    } catch (error) {
      // A definite refusal: it ended between the read and the send.
      if (!(error instanceof AgentRefusal) || error.code !== AGENT_ENDED_CODE)
        throw error;
      session = await fresh(id, use, guard);
      if (isAgentActive(session.status) || !session.resumable) throw error;
    }
  }
  return started(await resumeEnded(session, request, projectId, use, guard));
}

/** A finished conversation: resumed in a new run, or held with the reason. */
async function resumeEnded(
  ended: AgentSession,
  request: AgentMessageRequest,
  projectId: string | undefined,
  use: VoiceAgentDeps,
  guard: () => void,
): Promise<AgentSession> {
  if (!ended.resumable) throw new Error(finishedText(ended.runner));
  guard();
  const next = await use.resume(ended, request, projectId);
  window.dispatchEvent(new Event(OPEN_DECK));
  return next;
}

const started = (session: AgentSession): SendOutcome => ({
  kind: "started",
  session,
});
