import type { AgentSession } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import type { SupervisorActor } from "../../shared/supervisor";
import type { Activity } from "../busy";

/**
 * The session's newest received text for the deck's one-line bar: while it
 * works, the newest update; once it ends, its summary. Received text only,
 * as the bubble shows it; the state stands in until a line arrives.
 */
export function sessionLine(session: AgentSession): string {
  const latest = session.lines.at(-1)?.trim();
  const summary = session.summary?.trim();
  const text = isAgentActive(session.status)
    ? latest || summary
    : summary || latest;
  return (
    text || `${session.runner.toUpperCase()} · ${session.status.toUpperCase()}`
  );
}

/** What the bar says when nothing is running and nothing has been said. */
export const DECK_READY = "READY · SPEAK OR TYPE TO START";

/**
 * What the deck's bar says, newest first: a working session's newest line
 * (the bubble may be tucked away), then a running job's progress line, then
 * a finished session's last word, then linked agents and the supervisor.
 * Only when none of those has anything to say does it show `teaching` (the
 * deck's own timer picks which, `shared/teachings.ts`), or the ready line.
 */
export function deckNow({
  activity,
  session,
  linked,
  supervisor,
  teaching,
}: {
  activity: readonly Activity[];
  session?: AgentSession;
  linked: readonly Pick<SupervisorActor, "role">[];
  supervisor: { origin?: string; connected: boolean; connecting?: boolean };
  /** The idle teaching line, already in the bar's casing. */
  teaching?: string;
}): string {
  if (session && isAgentActive(session.status)) return sessionLine(session);
  const job = activity.at(-1)?.line;
  if (job) return job;
  if (session) return sessionLine(session);
  if (linked.length)
    return `LINKED · ${linked.map((actor) => actor.role).join(" + ")}`;
  if (supervisor.origin && !supervisor.connected)
    return supervisor.connecting
      ? "CONNECTING SUPERVISOR"
      : "SUPERVISOR DISCONNECTED";
  return teaching || DECK_READY;
}
