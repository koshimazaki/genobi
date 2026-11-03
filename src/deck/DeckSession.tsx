import { useState } from "react";
import type { AgentSession } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { AgentApprovals } from "../agent/AgentApprovals";
import { stopAgentSession } from "../agent/api";
import {
  showAgentSession,
  useAgentSessionError,
} from "../agent/useAgentSession";
import "../agent/agent.css";

/**
 * The shown agent session's controls, in the open deck: its paid steps
 * waiting for the person (plan, price, payer, Approve / Decline) and Stop.
 * These moved here from the bubble when the bubble became a static guide
 * (#57). Each answer is handed back through `showAgentSession`, which the
 * session follower picks up before its next poll.
 */
export default function DeckSession({ session }: { session: AgentSession }) {
  const readError = useAgentSessionError();
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string>();
  const active = isAgentActive(session.status);
  const stop = async () => {
    setStopping(true);
    try {
      showAgentSession(await stopAgentSession(session.id));
      setError(undefined);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setStopping(false);
    }
  };
  const shownError = error ?? readError;
  return (
    <div className="deck-session">
      {shownError && (
        <p className="agent-error" role="alert">
          {shownError}
        </p>
      )}
      <AgentApprovals session={session} onChange={showAgentSession} />
      {session.localSessionUrl && (
        <a
          className="deck-development"
          href={session.localSessionUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open local session · assets and paid approvals ↗
        </a>
      )}
      {active && (
        <button
          type="button"
          className="deck-development"
          disabled={stopping}
          onClick={() => void stop()}
        >
          {stopping ? "Stopping…" : "Stop session"}
        </button>
      )}
    </div>
  );
}
