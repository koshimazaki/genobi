// How an agent session's view reads (server/agent-sessions.ts): the copy the
// routes answer, its progress lines, kept to the newest few, and the status,
// line and summary once its runner exits, is stopped or runs out of time. A
// Terminal session ends the same way when its window's harness exits.
import type { AgentSession } from "../shared/agent-session";
import { AGENT_LINES_MAX } from "../shared/agent-session-events";
import { approvalViews } from "./agent-approvals";
import type { Running } from "./agent-session-types";

/** A copy of the session's view, with its steps and results. */
export function viewOf(session: Running): AgentSession {
  return {
    ...session.view,
    lines: [...session.view.lines],
    ...(session.view.exchange
      ? { exchange: session.view.exchange.map((entry) => ({ ...entry })) }
      : {}),
    ...(session.approvals.length
      ? { approvals: approvalViews(session.approvals) }
      : {}),
    ...(session.results.size
      ? { results: [...session.results.values()].map((r) => ({ ...r })) }
      : {}),
  };
}

/** Adds a progress line, keeping the newest `AGENT_LINES_MAX`. */
export function pushLine(session: Running, line: string) {
  session.view.lines.push(line);
  if (session.view.lines.length > AGENT_LINES_MAX)
    session.view.lines.splice(0, session.view.lines.length - AGENT_LINES_MAX);
}

/**
 * The view after the runner ended with `code`: stopped, out of time, waiting
 * for an approval it quoted, done, or failed, with a line saying which.
 */
export function settleEnded(
  session: Running,
  code: number | null,
  timeoutMs: number,
) {
  const minutes = Math.round(timeoutMs / 60_000);
  const status = session.stopping
    ? "stopped"
    : session.timedOut
      ? "failed"
      : session.finished === "done"
        ? session.refusedSpend ||
          session.approvals.some((p) => p.view.status === "pending")
          ? "waiting"
          : "done"
        : "failed";
  session.view.status = status;
  if (status === "stopped") pushLine(session, "Stopped.");
  else if (session.timedOut) {
    pushLine(session, `Stopped after ${minutes} minutes.`);
    session.view.summary ??= `The session ran past ${minutes} minutes and was stopped.`;
  } else if (status === "waiting")
    pushLine(session, "Waiting for you to approve a paid step.");
  else if (status === "failed" && !session.finished)
    session.view.summary ??= `The agent stopped without finishing (exit ${code ?? "signal"}).`;
}
