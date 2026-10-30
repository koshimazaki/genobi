import type { AgentExchange, AgentSession } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";

/**
 * The session as one conversation (Box 1.8): the person's first prompt and
 * each message they sent, and each reply the runner gave at the end of a
 * turn, oldest first, as the server recorded them. While a turn runs, the
 * latest received activity line follows. Nothing is inferred.
 */
export function AgentConversation({
  session,
  exchange,
}: {
  session: AgentSession;
  exchange: readonly AgentExchange[];
}) {
  const working = isAgentActive(session.status) && !session.idle;
  const latest = session.lines.at(-1)?.trim();
  return (
    <>
      <ol className="agent-exchange" aria-label="Conversation">
        {exchange.map((entry, index) => (
          <li key={`${entry.at}-${index}`} data-from={entry.from}>
            <div className="agent-source">
              {entry.from === "person" ? "You" : "Genobi"}
            </div>
            <p>{entry.text}</p>
            {entry.pending && (
              <p className="agent-footnote">{pendingNote(session)}</p>
            )}
          </li>
        ))}
      </ol>
      {working && latest && (
        <div className="agent-bubble-copy">
          <div className="agent-source">Agent update</div>
          <p className="agent-latest">{latest}</p>
        </div>
      )}
    </>
  );
}

/**
 * A message queued for a runner without live input that its Genobi MCP
 * server has not collected (Box 1.8): waiting, or never read.
 */
export const pendingNote = (session: AgentSession) =>
  isAgentActive(session.status)
    ? "Waiting for the agent's next Genobi step."
    : "Not read before the session ended.";

/** A conversation once the session holds more than its first prompt. */
export const conversationOf = (session?: AgentSession) =>
  session?.exchange && session.exchange.length > 1
    ? session.exchange
    : undefined;

/** Replies the runner has given, for the avatar's new-reply mark. */
export const replyCount = (exchange?: readonly AgentExchange[]) =>
  exchange?.filter((entry) => entry.from === "agent").length ?? 0;
