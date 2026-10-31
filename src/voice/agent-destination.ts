import { isAgentActive } from "../../shared/agent-session-events";
import {
  parseAgentMessage,
  type AgentSession,
} from "../../shared/agent-session";
import {
  readActiveSession,
  readAgentSession,
  sendAgentMessage,
} from "../agent/api";
import { sendToGenobi, type SendOutcome } from "../agent/send";
import {
  sessionProject,
  spawnFromStudio,
  spawnInFlight,
} from "../agent/spawn-store";
import {
  latestAgentSession,
  showAgentSession,
  OPEN_BUBBLE,
} from "../agent/useAgentSession";
import { studioStore } from "../studio/store";
import type { VoiceAgentTarget } from "./destination-store";

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
};

/** A selected conversation never falls through to a different session or a prompt. */
export async function sendVoiceToAgent(
  words: string,
  projectId: string | undefined,
  target?: VoiceAgentTarget,
  overrides: Partial<VoiceAgentDeps> = {},
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
  if (target) {
    const session = await use.read(target.session.id);
    guard();
    if (!isAgentActive(session.status))
      throw new Error(
        "That conversation has finished. Choose Current agent / new session to continue.",
      );
    if (session.localSessionUrl)
      throw new Error(
        "This conversation takes messages in its local studio. Open the local session or copy the transcript.",
      );
    const next = await use.message(session.id, request);
    use.show(next);
    window.dispatchEvent(new Event(OPEN_BUBBLE));
    return { kind: "sent", session: next };
  }
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
      return use.message(id, message);
    },
    spawn: (message) => {
      guard();
      if (use.spawning())
        throw new Error(
          "An agent is already being started. Wait for setup to finish, then send this transcript.",
        );
      return use.spawn(message);
    },
    show: use.show,
  });
}
