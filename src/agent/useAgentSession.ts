import { useCallback, useState, useSyncExternalStore } from "react";
import type {
  AgentSession,
  AgentSessionRequest,
} from "../../shared/agent-session";
import { startAgentSession } from "./api";

/**
 * Which agent session the studio's panel shows. Any caller can open it: the
 * voice overlay's Project prompt starts a session and hands it here, and the
 * one `AgentSessionPanel` mounted in the shell follows it.
 */
let shown: AgentSession | undefined;
export const shownAgentSession = () => shown;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Opens the panel on a session, as the start route answered it. */
export function showAgentSession(session: AgentSession) {
  shown = session;
  emit();
}

/**
 * The panel's latest read of the shown session, as it polls: what the Genobi
 * deck draws its log and stage from without polling a second time.
 */
let latest: AgentSession | undefined;
export function publishAgentSession(session: AgentSession | undefined) {
  if (latest === session) return;
  latest = session;
  emit();
}
/** The newest read of the shown session, or the shown session itself. */
export const latestAgentSession = () =>
  latest && latest.id === shown?.id ? latest : shown;
/**
 * `latestAgentSession`, kept current: a newly shown session reaches the deck
 * at once, before the panel's first poll publishes it.
 */
export function useLatestAgentSession() {
  return useSyncExternalStore(subscribe, latestAgentSession, () => undefined);
}

/** Asks the bubble to open, as the deck's "Open bubble" does. */
export const OPEN_BUBBLE = "genobi:open-bubble";

export function closeAgentSession() {
  shown = undefined;
  latest = undefined;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The session the panel shows, or undefined when it is closed. */
export function useShownAgentSession() {
  return useSyncExternalStore(
    subscribe,
    () => shown,
    () => undefined,
  );
}

/**
 * Starts a project-prompt session and opens the panel on it. `error` holds the
 * server's own sentence when it refuses (no runner set up, one already
 * running, a bad prompt).
 */
export function useAgentSession() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const start = useCallback(async (request: AgentSessionRequest) => {
    setStarting(true);
    setError(undefined);
    try {
      const session = await startAgentSession(request);
      showAgentSession(session);
      return session;
    } catch (failure) {
      setError((failure as Error).message);
      return undefined;
    } finally {
      setStarting(false);
    }
  }, []);
  return { start, starting, error };
}
