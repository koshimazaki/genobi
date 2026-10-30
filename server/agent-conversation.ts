// A running session's conversation (Box 1.8): the first prompt and each
// further message the person sends, written to a live runner's stdin as a
// queued user turn (Claude Code's `--input-format stream-json`), and each
// reply the runner gives at the end of a turn. Once every turn is answered
// and no message arrives for a while, the input closes and the runner
// finishes as a one-turn session always did. A runner without live input
// (Hermes, a Terminal window) gets the message through its Genobi MCP server
// when the route passes a `queue`, and is refused with
// `agent_no_live_transport` without one.
import type { Writable } from "node:stream";
import {
  AGENT_ENDED_CODE,
  AGENT_EXCHANGE_MAX,
  AGENT_FINISHING_CODE,
  AGENT_NO_TRANSPORT_CODE,
  AGENT_NO_TRANSPORT_MESSAGE,
  isAgentActive,
} from "../shared/agent-session-events";
import { userTurn } from "./agent-runner";
import type { Running } from "./agent-session-types";
import { AppError } from "./errors";

/** How long a live session waits for the next message after a reply. */
export const IDLE_MS = 5 * 60_000;

/** Adds an entry to the conversation, keeping the newest few. */
export function record(
  session: Running,
  from: "person" | "agent",
  text: string,
  pending = false,
) {
  const exchange = (session.view.exchange ??= []);
  exchange.push({
    from,
    text,
    at: new Date().toISOString(),
    ...(pending ? { pending } : {}),
  });
  if (exchange.length > AGENT_EXCHANGE_MAX)
    exchange.splice(0, exchange.length - AGENT_EXCHANGE_MAX);
}

/** The runner's stdin stays open: the first turn is already written. */
export function openInput(
  session: Running,
  input: Pick<Writable, "write" | "end"> | null | undefined,
  idleMs: number,
) {
  if (!input) return;
  session.input = input;
  session.streams = true;
  session.turns = 1;
  session.idleMs = idleMs;
  session.view.live = true;
}

/**
 * A turn's result arrived. With none still queued the session waits for
 * the person; after `idleMs` with no message its input closes.
 */
export function turnEnded(session: Running) {
  if (!session.input) return;
  session.turns = Math.max(0, (session.turns ?? 1) - 1);
  if (session.turns > 0) return;
  session.view.idle = true;
  clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(
    () => closeInput(session),
    session.idleMs ?? IDLE_MS,
  );
  session.idleTimer.unref();
}

/** Stop, the time limit, the idle wait or the runner's end: no more turns. */
export function closeInput(session: Running) {
  clearTimeout(session.idleTimer);
  session.idleTimer = undefined;
  const input = session.input;
  session.input = undefined;
  delete session.view.live;
  delete session.view.idle;
  try {
    input?.end();
  } catch {
    // Already closed by the runner's exit.
  }
}

/** The person's further message, as one queued user turn. */
export function deliver(
  session: Running,
  text: string,
  queue?: (id: string, text: string) => void,
) {
  if (!isAgentActive(session.view.status) || session.stopping)
    throw new AppError(
      409,
      "That session has ended. Start a new one.",
      AGENT_ENDED_CODE,
    );
  // No live input (Hermes, a Terminal window): with a `queue`, the session's
  // Genobi MCP server collects it at the agent's next tool call (Box 1.8).
  if (!session.input && !session.streams && queue) {
    queue(session.view.id, text);
    record(session, "person", text, true);
    return;
  }
  if (!session.input)
    throw session.streams
      ? new AppError(
          409,
          "That session is finishing. Send again in a moment.",
          AGENT_FINISHING_CODE,
        )
      : new AppError(409, AGENT_NO_TRANSPORT_MESSAGE, AGENT_NO_TRANSPORT_CODE);
  clearTimeout(session.idleTimer);
  session.idleTimer = undefined;
  delete session.view.idle;
  // This turn decides how the session ends, not an earlier one's result.
  session.finished = undefined;
  session.turns = (session.turns ?? 0) + 1;
  session.input.write(userTurn(text));
  record(session, "person", text);
}
