import type { AgentSession } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { AgentVoiceButton } from "../voice/AgentVoiceButton";
import { OPEN_DECK } from "./useAgentSession";

/** The newest received text: the agent's last reply, else its latest line. */
export function sessionGlance(session: AgentSession) {
  const reply = [...(session.exchange ?? [])]
    .reverse()
    .find((e) => e.from === "agent")
    ?.text.trim();
  return reply || session.summary?.trim() || session.lines.at(-1)?.trim();
}

/**
 * A compact status for a voice-driven session, at the top of the guide
 * bubble (#57): Genobi is voice-first, so the person who spoke sees that the
 * agent is working, its newest received words, and where results appear.
 * Speak to agent continues the same conversation through the shared voice
 * recorder; the full log, approvals and Stop are in the footer deck.
 */
export function GuideSessionStatus({
  session,
  onDeck,
}: {
  session: AgentSession;
  onDeck: () => void;
}) {
  const active = isAgentActive(session.status);
  const glance = sessionGlance(session);
  return (
    <div className="agent-bubble-copy" role="status" aria-atomic="true">
      <div className="agent-source">
        {active ? "Agent working" : "Session finished"}
      </div>
      {glance && <p className="agent-latest">{glance}</p>}
      <p className="agent-guide-note">
        {active
          ? "Results appear in Camera, the Gallery or World as they land."
          : "Its results are in Camera, the Gallery or World."}
      </p>
      <div className="agent-guide-actions">
        {active && <AgentVoiceButton session={session} />}
        <button
          type="button"
          onClick={() => {
            onDeck();
            window.dispatchEvent(new Event(OPEN_DECK));
          }}
        >
          Open log
        </button>
      </div>
    </div>
  );
}
