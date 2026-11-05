// One update from a runner's stream (server/agent-stream.ts,
// server/agent-hermes-stream.ts) applied to its session: status, progress
// line, reply, paid refusal, the runner's conversation id for Continue
// (issue #58), a step in the deck's chain (#96) and the end of a turn.
import { keepRunnerSession } from "./agent-continue";
import { record, turnEnded } from "./agent-conversation";
import { noteTool, pushLine } from "./agent-session-end";
import type { Running } from "./agent-session-types";
import type { StreamUpdate } from "./agent-stream";

export function applyUpdate(session: Running, update: StreamUpdate) {
  if (update.started && session.view.status === "starting")
    session.view.status = "running";
  if (update.line) pushLine(session, update.line);
  if (update.summary) {
    session.view.summary = update.summary;
    record(session, "agent", update.summary);
  }
  if (update.refusedSpend) session.refusedSpend = true;
  if (update.runnerSession) keepRunnerSession(session, update.runnerSession);
  if (update.tool) noteTool(session, update.tool);
  if (update.finished) {
    session.finished = update.finished;
    turnEnded(session);
  }
}
