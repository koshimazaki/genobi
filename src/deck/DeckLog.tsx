import { useEffect, useRef } from "react";
import type { AgentSession } from "../../shared/agent-session";
import type { SupervisorActor } from "../../shared/supervisor";
import type { Activity } from "../busy";
import { OPEN_BUBBLE } from "../agent/useAgentSession";
import { OPEN_DEVELOPMENT } from "../supervisor/store";
import { useShell } from "../studio/ShellContext";
import { studioStore } from "../studio/store";

/**
 * The open deck's log: what is working now, then the whole received log of
 * the session the bubble shows (the request, every retained update oldest
 * first, the summary), then linked agents. The bubble announces state
 * changes, so this narration is not a live region. Its actions only move
 * the person somewhere: the bubble (where Stop and approvals live), the
 * project's assets, Development. Nothing here starts, approves or pays.
 */
export default function DeckLog({
  activity,
  session,
  actors,
  linked,
  supervisor,
}: {
  activity: readonly Activity[];
  session?: AgentSession;
  actors: readonly SupervisorActor[];
  linked: readonly SupervisorActor[];
  supervisor: { origin?: string; connected: boolean; connecting?: boolean };
}) {
  const shell = useShell();
  const log = useRef<HTMLDivElement>(null);
  // Opening lands on the newest lines and the actions; after that, arriving
  // lines never move the reading position.
  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, []);
  return (
    <div ref={log} className="deck-log" role="log" aria-live="off" tabIndex={0}>
      {activity.map((a) => (
        <p key={a.id} className="deck-line is-now">
          {a.line}
        </p>
      ))}
      {session && (
        <>
          <p className="deck-line is-head">
            {session.runner.toUpperCase()} · {session.status.toUpperCase()}
          </p>
          <p className="deck-line is-quiet">› {session.prompt}</p>
          {session.lines.map((line, i) => (
            <p key={i} className="deck-line">
              {line}
            </p>
          ))}
          {session.summary && (
            <p className="deck-line is-summary">{session.summary}</p>
          )}
        </>
      )}
      {linked.map((actor) => (
        <p
          key={actor.id}
          className="deck-line deck-external-update"
          title={actor.summary || `${actor.role} linked`}
        >
          <span>{actor.role}</span> · {actor.summary || "Linked"}
        </p>
      ))}
      {supervisor.origin && !supervisor.connected && (
        <p className="deck-line is-quiet">
          {supervisor.connecting
            ? "Connecting supervisor…"
            : "Supervisor disconnected. External agent activity is not currently available."}
        </p>
      )}
      {!session &&
        activity.length === 0 &&
        actors.length === 0 &&
        !supervisor.origin && (
          <p className="deck-line is-quiet">
            No linked agent in this view. Ask Genobi by voice, or connect an
            external supervisor in Development.
          </p>
        )}
      <div className="deck-actions">
        {session && (
          <button
            type="button"
            className="deck-development"
            onClick={() => window.dispatchEvent(new Event(OPEN_BUBBLE))}
          >
            Open bubble
          </button>
        )}
        {shell && session && (
          <button
            type="button"
            className="deck-development"
            onClick={() => {
              shell.select("director");
              studioStore.getState().actions.workspace({ drawerOpen: true });
            }}
          >
            Project assets ↗
          </button>
        )}
        {shell && (
          <button
            type="button"
            className="deck-development"
            onClick={() => {
              shell.select("tools");
              window.dispatchEvent(new Event(OPEN_DEVELOPMENT));
            }}
          >
            Open Development ↗
          </button>
        )}
      </div>
    </div>
  );
}
