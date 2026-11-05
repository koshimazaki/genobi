// How an agent session's view reads (server/agent-sessions.ts): the copy the
// routes answer, its progress lines, kept to the newest few, and the status,
// line and summary once its runner exits, is stopped or runs out of time. A
// Terminal session ends the same way when its window's harness exits.
import type { AgentSession } from "../shared/agent-session";
import {
  AGENT_LINES_MAX,
  AGENT_TOOLS_MAX,
  type AgentToolCall,
} from "../shared/agent-session-events";
import { approvalViews } from "./agent-approvals";
import type { Running } from "./agent-session-types";
import type { ToolUpdate } from "./agent-stream";

/** A copy of the session's view, with its steps and results. */
export function viewOf(session: Running): AgentSession {
  return {
    ...session.view,
    lines: [...session.view.lines],
    ...(session.view.tools
      ? { tools: session.view.tools.map((call) => ({ ...call })) }
      : {}),
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
 * Records a tool call the runner's events reported: a `started` adds it as
 * working, keeping the newest `AGENT_TOOLS_MAX`; a result settles its call,
 * found by id (Claude Code) or else as the oldest working call of that name,
 * or the oldest working call (Hermes). A result with no call is dropped.
 */
export function noteTool(session: Running, update: ToolUpdate) {
  const tools = (session.view.tools ??= []);
  const open = (session.toolCalls ??= new Map<string, AgentToolCall>());
  if (update.phase === "started") {
    if (!update.name) return;
    const call: AgentToolCall = {
      name: update.name,
      state: "working",
      at: new Date().toISOString(),
      ...(update.detail ? { detail: update.detail } : {}),
    };
    tools.push(call);
    if (update.id) open.set(update.id, call);
    if (tools.length > AGENT_TOOLS_MAX) {
      const dropped = new Set(tools.splice(0, tools.length - AGENT_TOOLS_MAX));
      for (const [id, held] of open) if (dropped.has(held)) open.delete(id);
    }
    return;
  }
  const working = tools.filter((call) => call.state === "working");
  const call = update.id
    ? open.get(update.id)
    : (working.find((c) => c.name === update.name) ?? working[0]);
  if (update.id) open.delete(update.id);
  if (call?.state === "working") call.state = update.phase;
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
