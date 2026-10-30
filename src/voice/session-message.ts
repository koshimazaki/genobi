import type { AgentSession } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { sendAgentMessage } from "../agent/api";
import {
  latestAgentSession,
  OPEN_BUBBLE,
  showAgentSession,
} from "../agent/useAgentSession";
import { runnerName } from "./agent-client";

/** Where a transcript went, and the words it took there. */
export type Routed =
  | { kind: "intent"; text: string; words: string }
  | { kind: "filled"; text: string; words: string; field: string }
  | { kind: "session"; text: string; words: string; session: string }
  /** A session is running: the project prompt is the agent's to change. */
  | { kind: "held"; text: string; words: string }
  | { kind: "none"; words: string; text?: string };

export const NO_PROMPT = "No prompt on this screen.";

/** The running session the bubble follows for this person, if any. */
export function liveSession(
  read: () => AgentSession | undefined = latestAgentSession,
) {
  const session = read();
  return session && isAgentActive(session.status) ? session : undefined;
}

/**
 * `pending`: the session's runner takes no live input, so the message waits
 * for the agent's next Genobi tool call (Box 1.8).
 */
export type Sent =
  { ok: true; pending: boolean } | { ok: false; error: string };

/**
 * Sends the words to the running session as the person's next message
 * (`POST /api/agent/sessions/:id/messages`, Box 1.8), then shows the
 * session's answer in the bubble and opens it. A session relayed from the
 * hosted studio has no message route. Never throws.
 */
export async function sendToSession(
  session: AgentSession,
  words: string,
  send = sendAgentMessage,
): Promise<Sent> {
  if (session.localSessionUrl)
    return {
      ok: false,
      error: "This session runs on another machine and takes no messages here.",
    };
  try {
    const view = await send(session.id, { prompt: words, source: "voice" });
    showAgentSession(view);
    window.dispatchEvent(new Event(OPEN_BUBBLE));
    return { ok: true, pending: !!view.exchange?.at(-1)?.pending };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export const sessionNote = (session: AgentSession, pending = false) =>
  `Sent to your ${runnerName(session.runner)} session as your next message.${pending ? " It waits for the agent's next Genobi step." : ""} Paid steps still wait for your approval.`;

/**
 * The panel's buttons for where the words went: the correction button (only
 * once the transcript differs) and the other way to send them.
 */
export function panelActions(
  routed: Routed,
  corrected: boolean,
  running: boolean,
) {
  const placed = routed.kind !== "none" && routed.kind !== "held";
  const update = !corrected
    ? undefined
    : routed.kind === "session"
      ? "Send correction"
      : placed
        ? "Update prompt"
        : "Try again";
  const other =
    routed.kind === "session"
      ? "To prompt"
      : placed
        ? "Send to agent instead"
        : running
          ? "Send to agent"
          : "Do it in a session";
  return { update, other, placed };
}

export interface Destinations {
  /** A Camera request ("an image with FLUX of a penguin"), or undefined. */
  intent: (words: string) => Routed | undefined;
  live: () => AgentSession | undefined;
  send: (session: AgentSession, words: string) => Promise<Sent>;
  /** The prompt on screen (or none), as typing would fill it. */
  prompt: (words: string) => Routed;
}

/**
 * Box 1.8's order for a new transcript: a Camera request goes to Camera;
 * otherwise a running session takes it as the person's next message;
 * otherwise, or with `toPrompt` (the panel's "To prompt"), the prompt on
 * screen. A session that refuses it (it just ended, or it runs elsewhere)
 * leaves the words to the prompt, with its reason. Nothing is submitted or
 * paid.
 */
export async function deliverTranscript(
  words: string,
  to: Destinations,
  toPrompt = false,
): Promise<Routed> {
  if (!words) return { kind: "none", words };
  const intent = to.intent(words);
  if (intent) return intent;
  const session = toPrompt ? undefined : to.live();
  if (!session) return to.prompt(words);
  const sent = await to.send(session, words);
  if (sent.ok)
    return {
      kind: "session",
      words,
      session: session.id,
      text: sessionNote(session, sent.pending),
    };
  const placed = to.prompt(words);
  const why = `The session did not take it: ${sent.error}`;
  return {
    ...placed,
    text: `${why} ${placed.kind === "none" ? NO_PROMPT : placed.text}`,
  };
}
