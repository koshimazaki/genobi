import { useEffect, useState } from "react";
import { PROGRAMS, type ProgramName } from "../../shared/ascii/programs";
import { isAgentActive } from "../../shared/agent-session-events";
import { useActivity } from "../busy";
import { OPEN_DECK, useLatestAgentSession } from "../agent/useAgentSession";
import { approvable } from "../../shared/agent-approval";
import Spinner from "../components/Spinner";
import TerminalVisualiser from "./TerminalVisualiser";
import DeckLog from "./DeckLog";
import { DECK_READY, deckNow } from "./deck-now";
import "./deck.css";
import { useWalkers } from "./walkers/konami";
import WalkersSlot from "./walkers/WalkersSlot";
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
 * The Genobi deck: a small terminal in the footer that opens upward. The
 * bubble is a static guide (#57); the deck is where an agent session shows:
 * its bar has the newest line of the shown session (or a running job's
 * progress line), and opening it shows the whole log, the session's
 * approvals and Stop, the actions and a visualiser with Winamp-style modes.
 * It reads what the studio already polls, so it runs the same in a browser
 * and in a desktop shell. Mounted once, beside the bubble in the wordmark
 * (`tests/deck-mounted.test.tsx` fails if the studio header drops it).
 */
export default function GenobiDeck() {
  const [state, setState] = useState(remembered);
  const [score, setScore] = useState(0);
  const activity = useActivity();
  const session = useLatestAgentSession();
  const supervisor = useSupervisor();
  // The Konami code opens the walkers game in the deck; Esc hands it back.
  const walkers = useWalkers();
  const open = state.open || walkers.on;
  const actors = supervisor.connected ? supervisor.actors : [];
  const linked = actors.filter(
    (actor) => actor.state !== "stopped" && actor.state !== "finished",
  );
  const sessionActive = session ? isAgentActive(session.status) : false;
  const working = activity.length > 0 || sessionActive;
  // A paid step waiting for the person opens the deck on its approval, and
  // so does a message sent to the session (voice's Send to agent).
  const attention = !!session?.approvals?.some((a) => approvable(a));
  useEffect(() => {
    if (attention) setState((s) => (s.open ? s : { ...s, open: true }));
  }, [attention]);
  useEffect(() => {
    const show = () => setState((s) => (s.open ? s : { ...s, open: true }));
    window.addEventListener(OPEN_DECK, show);
    return () => window.removeEventListener(OPEN_DECK, show);
  }, []);
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
      className={`genobi-deck${open ? " is-open" : ""}`}
      aria-label="Genobi terminal"
    >
      {open && (
        <div className="deck-body">
          <WalkersSlot walkers={walkers}>
            <TerminalVisualiser
              program={
                NAMES.includes(state.program) ? state.program : "metaballs"
              }
              working={working}
              onCycle={cycle}
              score={score}
              onScore={setScore}
            />
          </WalkersSlot>
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
        aria-expanded={open}
        onClick={() =>
          walkers.on
            ? walkers.exit()
            : setState((s) => ({ ...s, open: !s.open }))
        }
      >
        <Spinner name={working ? "dots12" : "sand"} on={working} />
        <span className="deck-title">GENOBI</span>
        <span
          className={`deck-now${showingTeaching ? " is-teaching" : ""}`}
          title={now}
        >
          {now}
        </span>
        <span className="deck-toggle">{open ? "▾" : "▴"}</span>
      </button>
    </section>
  );
}
