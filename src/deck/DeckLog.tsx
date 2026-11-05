import { useEffect, useRef } from "react";
import type { AgentSession } from "../../shared/agent-session";
import type { SupervisorActor } from "../../shared/supervisor";
import type { Activity } from "../busy";
import { OPEN_DEVELOPMENT } from "../supervisor/store";
import { useShell } from "../studio/ShellContext";
import { studioStore } from "../studio/store";
import { AgentVoiceButton } from "../voice/AgentVoiceButton";
import DeckSession from "./DeckSession";
import StepChain from "./StepChain";
import { deckSteps } from "../../shared/deck-steps";

/**
 * The open deck's log: the chain of steps (`StepChain`), kept in view at
 * its top (running jobs are steps there), then the whole received log of
 * the shown agent session (the request, every retained update oldest first,
 * the summary) with its approvals and Stop (`DeckSession`), then linked
 * agents. Not a live region; the approvals announce their own status. The
 * other actions only move the person: Speak to agent, the project's assets,
 * Development. Approve is the person's own click on a quoted step.
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
  const work = activity.filter((a) => !a.background);
  // Opening lands on the newest lines and the actions; after that, arriving
  // lines never move the reading position.
  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, []);
  return (
    <div ref={log} className="deck-log" role="log" aria-live="off" tabIndex={0}>
      {/* Play (the walkers game's status) is not a step of the work. */}
      <StepChain
        steps={deckSteps({
          session,
          jobs: work,
        })}
      />
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
          {/* The conversation (Box 1.8), past the first prompt shown above. */}
          {(session.exchange ?? []).slice(1).map((entry, i) => (
            <p
              key={`${entry.at}-${i}`}
              className={`deck-line${entry.from === "person" ? " is-quiet" : " is-summary"}`}
            >
              {entry.from === "person" ? "YOU › " : "GENOBI › "}
              {entry.text}
              {entry.pending ? " (not read yet)" : ""}
            </p>
          ))}
          <DeckSession session={session} />
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
        work.length === 0 &&
        actors.length === 0 &&
        !supervisor.origin && (
          <p className="deck-line is-quiet">
            No linked agent in this view. Drive Genobi from a terminal (MCP or
            the genobi CLI), or connect an external supervisor in Development.
          </p>
        )}
      <div className="deck-actions">
        <AgentVoiceButton session={session} className="deck-development" />
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
