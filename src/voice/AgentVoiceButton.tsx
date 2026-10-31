import type { AgentSession } from "../../shared/agent-session";
import { voiceProjectId } from "./agent-destination";
import { openAgentVoice } from "./destination-store";

/** Reuses the global recorder and pins the conversation behind this log. */
export function AgentVoiceButton({
  session,
  className,
}: {
  session?: AgentSession;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => openAgentVoice(session, voiceProjectId())}
      title="Speak to this agent conversation"
    >
      Speak to agent
    </button>
  );
}
