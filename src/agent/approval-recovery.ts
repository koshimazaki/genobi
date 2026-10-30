import { useSyncExternalStore } from "react";
import type { AgentSession } from "../../shared/agent-session";
import { readAgentSession } from "./api";
import { announceApprovedJob, backoff } from "./approved-jobs";

/**
 * How an approved step ended, if that is known: its recorded result (which
 * outlives the step's place in the list), else the step itself once it is
 * no longer being sent. Undefined while it is unknown.
 */
export function outcomeOf(session: AgentSession, quoteId: string) {
  const result = session.results?.find((r) => r.quoteId === quoteId);
  if (result) return result;
  const step = session.approvals?.find((a) => a.quoteId === quoteId);
  return step && step.status !== "submitting" ? step : undefined;
}

/**
 * After an Approve whose answer did not arrive (or arrived as an error), the
 * step's outcome is read back, never resent: the session is read until the
 * step's outcome is known (`outcomeOf`), with backoff, for as long as the
 * studio is open. A failed read is tried again. Resolves with the session that says
 * how the step ended, or undefined once `signal` aborts.
 */
export async function recoverStep({
  sessionId,
  quoteId,
  read,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  signal,
}: {
  sessionId: string;
  quoteId: string;
  read: (id: string, signal?: AbortSignal) => Promise<AgentSession>;
  wait?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}): Promise<AgentSession | undefined> {
  for (let attempt = 0; !signal?.aborted; attempt++) {
    try {
      const session = await read(sessionId, signal);
      // Known: a recorded result (kept even once the step has left the
      // list), or a step that is no longer being sent. A step that is gone
      // with no result is not settled: read again.
      if (outcomeOf(session, quoteId)) return session;
    } catch {
      // Not known yet: read again.
    }
    if (signal?.aborted) break;
    await wait(backoff(attempt));
  }
  return undefined;
}

/**
 * One recovery per step, running side by side: a second lost Approve never
 * replaces or aborts the first's, and every run they find reaches `onJob`.
 * `stop` ends them all (the panel closed).
 */
export class Recoveries {
  private running = new Map<string, AbortController>();
  constructor(
    private deps: {
      sessionId: string;
      read: (id: string, signal?: AbortSignal) => Promise<AgentSession>;
      onSession: (session: AgentSession) => void;
      onJob: (jobId: string) => void;
      /** The steps still being recovered, after every change. */
      onActive?: (quoteIds: string[]) => void;
      wait?: (ms: number) => Promise<void>;
    },
  ) {}

  active() {
    return [...this.running.keys()];
  }

  /** Starts reading this step back, unless it already is. */
  start(quoteId: string) {
    if (this.running.has(quoteId)) return;
    const controller = new AbortController();
    this.running.set(quoteId, controller);
    this.deps.onActive?.(this.active());
    void recoverStep({
      sessionId: this.deps.sessionId,
      quoteId,
      read: this.deps.read,
      signal: controller.signal,
      ...(this.deps.wait ? { wait: this.deps.wait } : {}),
    }).then((session) => {
      if (this.running.get(quoteId) !== controller) return;
      this.running.delete(quoteId);
      this.deps.onActive?.(this.active());
      if (!session) return;
      this.deps.onSession(session);
      const step = outcomeOf(session, quoteId);
      // A started run, or one whose outcome is uncertain but whose reserved
      // job is known: either may have been sent, so the gallery shows it.
      if (
        (step?.status === "started" || step?.status === "uncertain") &&
        step.jobId
      )
        this.deps.onJob(step.jobId);
    });
  }

  stop() {
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
  }
}

/*
 * The studio's long-lived owner of recoveries: module state, not the bubble.
 * Tucking the bubble away unmounts the steps' view, never their recovery, so
 * a paid run's outcome never depends on a panel being open. Each recovered
 * run reaches the gallery through `announceApprovedJob`.
 */
type RecoveryDeps = Pick<
  ConstructorParameters<typeof Recoveries>[0],
  "read" | "wait"
>;
const owners = new Map<string, Recoveries>();
const activeListeners = new Set<() => void>();
const sessionListeners = new Set<(session: AgentSession) => void>();
let active: Record<string, string[]> = {};
/** The latest session each recovery read back, by session id. */
let latest: Record<string, AgentSession> = {};
const none: string[] = [];

/** Reads this step back until its outcome is known; a no-op if it already is. */
export function recoverApproval(
  sessionId: string,
  quoteId: string,
  deps: Partial<RecoveryDeps> = {},
) {
  let owner = owners.get(sessionId);
  if (!owner) {
    owner = new Recoveries({
      sessionId,
      read: deps.read ?? ((id, signal) => readAgentSession(id, signal)),
      ...(deps.wait ? { wait: deps.wait } : {}),
      onSession: (session) => {
        // Kept, so a view mounted later (a reopened bubble) shows it.
        latest = { ...latest, [session.id]: session };
        activeListeners.forEach((l) => l());
        sessionListeners.forEach((l) => l(session));
      },
      onJob: (id) => announceApprovedJob({ id }),
      onActive: (ids) => {
        active = { ...active, [sessionId]: ids };
        activeListeners.forEach((l) => l());
      },
    });
    owners.set(sessionId, owner);
  }
  owner.start(quoteId);
}

/** The steps of this session still being read back. */
export const recovering = (sessionId: string) => active[sessionId] ?? none;

export function useRecovering(sessionId: string) {
  const subscribe = (listener: () => void) => {
    activeListeners.add(listener);
    return () => void activeListeners.delete(listener);
  };
  const read = () => recovering(sessionId);
  return useSyncExternalStore(subscribe, read, read);
}

/** The latest session a recovery read back for this session, if any. */
export const recoveredSession = (sessionId: string) => latest[sessionId];

export function useRecoveredSession(sessionId: string) {
  const subscribe = (listener: () => void) => {
    activeListeners.add(listener);
    return () => void activeListeners.delete(listener);
  };
  const read = () => recoveredSession(sessionId);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The steps to show: each as the session says, unless a recovery has since
 * read it as sent or settled, so a reopened bubble never offers Approve on a
 * step that was already submitted.
 */
export function mergeRecovered(
  session: AgentSession,
  recovered: AgentSession | undefined,
): AgentSession {
  if (!recovered || recovered.id !== session.id) return session;
  const later = new Map(
    (recovered.approvals ?? [])
      .filter((a) => a.status !== "pending")
      .map((a) => [a.quoteId, a]),
  );
  return {
    ...session,
    approvals: (session.approvals ?? []).map(
      (a) => (a.status === "pending" && later.get(a.quoteId)) || a,
    ),
  };
}

/** A session a recovery read back, for whichever view is open. */
export function onRecoveredSession(listener: (session: AgentSession) => void) {
  sessionListeners.add(listener);
  return () => void sessionListeners.delete(listener);
}

/** Tests start from nothing. */
export function resetRecoveriesForTests() {
  for (const owner of owners.values()) owner.stop();
  owners.clear();
  active = {};
  latest = {};
}
