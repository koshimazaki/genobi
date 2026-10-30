import { useEffect, useState } from "react";
import { PROGRAMS, type ProgramName } from "../../shared/ascii/programs";
import { isAgentActive } from "../../shared/agent-session-events";
import { useActivity } from "../busy";
import { useLatestAgentSession } from "../agent/useAgentSession";
import Spinner from "../components/Spinner";
import TerminalVisualiser from "./TerminalVisualiser";
import DeckLog from "./DeckLog";
import { DECK_READY, deckNow } from "./deck-now";
import "./deck.css";
import { useSupervisor } from "../supervisor/store";
import { teachingLine } from "../../shared/teachings";
import { useIdleTeaching } from "../teachings/useIdleTeaching";
import "../teachings/teachings.css";

const NAMES = Object.keys(PROGRAMS) as ProgramName[];
const KEY = "genobi.deck";

/** The viewer's own choices, kept in this browser only; any failure falls back. */
function remembered(): { open: boolean; program: ProgramName } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      open: saved.open === true,
      program: NAMES.includes(saved.program) ? saved.program : "metaballs",
    };
  } catch {
    return { open: false, program: "metaballs" };
  }
}

/**
 * The Genobi deck: a small terminal in the footer that opens upward. Voice and
 * the bubble stay the way in; the bubble is for the conversation, the deck
 * for the detail. Its bar shows the newest line of the session the bubble
 * shows (or a running job's progress line), so it still reads while the
 * bubble is tucked away; opening it shows the whole log, the actions and a
 * visualiser with Winamp-style modes. It reads what the studio already
 * polls, so it runs the same in a browser and in a desktop shell. Mounted
 * once, beside the bubble in the wordmark (`tests/deck-mounted.test.tsx`
 * fails if the studio header drops it).
 */
export default function GenobiDeck() {
  const [state, setState] = useState(remembered);
  const [score, setScore] = useState(0);
  const activity = useActivity();
  const session = useLatestAgentSession();
  const supervisor = useSupervisor();
  const actors = supervisor.connected ? supervisor.actors : [];
  const linked = actors.filter(
    (actor) => actor.state !== "stopped" && actor.state !== "finished",
  );
  const sessionActive = session ? isAgentActive(session.status) : false;
  const working = activity.length > 0 || sessionActive;
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* Private windows keep the default. */
    }
  }, [state]);

  // Teachings only fill a bar that would otherwise read the ready line.
  const idle =
    deckNow({ activity, session, linked, supervisor }) === DECK_READY;
  const teaching = useIdleTeaching(idle);
  const line = teaching && teachingLine(teaching);
  const now = deckNow({
    activity,
    session,
    linked,
    supervisor,
    teaching: line,
  });
  // Only the teaching takes the pixel font (teachings.css), never real status.
  const showingTeaching = !!line && now === line;
  const cycle = () =>
    setState((s) => ({
      ...s,
      program: NAMES[(NAMES.indexOf(s.program) + 1) % NAMES.length],
    }));

  return (
    <section
      className={`genobi-deck${state.open ? " is-open" : ""}`}
      aria-label="Genobi terminal"
    >
      {state.open && (
        <div className="deck-body">
          <TerminalVisualiser
            program={
              NAMES.includes(state.program) ? state.program : "metaballs"
            }
            working={working}
            onCycle={cycle}
            score={score}
            onScore={setScore}
          />
          <DeckLog
            activity={activity}
            session={session}
            actors={actors}
            linked={linked}
            supervisor={supervisor}
          />
        </div>
      )}
      <button
        type="button"
        className="deck-bar"
        aria-expanded={state.open}
        onClick={() => setState((s) => ({ ...s, open: !s.open }))}
      >
        <Spinner name={working ? "dots12" : "sand"} on={working} />
        <span className="deck-title">GENOBI</span>
        <span
          className={`deck-now${showingTeaching ? " is-teaching" : ""}`}
          title={now}
        >
          {now}
        </span>
        <span className="deck-toggle">{state.open ? "▾" : "▴"}</span>
      </button>
    </section>
  );
}
