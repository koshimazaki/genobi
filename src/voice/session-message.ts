import type { AgentSession } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { latestAgentSession } from "../agent/useAgentSession";

/** Where a transcript went, and the exact words delivered there. */
export type Routed =
  | { kind: "intent"; text: string; words: string }
  | {
      kind: "filled";
      text: string;
      words: string;
      field: string;
      scope?: string;
    }
  | { kind: "session"; text: string; words: string; session: string }
  | { kind: "held"; text: string; words: string }
  | { kind: "none"; words: string; text?: string };

/** Used only to protect the project prompt while its agent is editing it. */
export function liveSession(
  read: () => AgentSession | undefined = latestAgentSession,
) {
  const session = read();
  return session && isAgentActive(session.status) ? session : undefined;
}
