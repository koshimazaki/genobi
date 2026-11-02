/**
 * The World tab's agent link (docs/world-live.md, "Spoken control"): one
 * bridge connection shared by Connect agents (its one-use code, for a
 * terminal agent) and the studio's own running session, which the tab
 * grants by its browser so a spoken "move the camera" needs no code.
 *
 * - While World Builder is on screen and the person has a running session,
 *   the tab connects if it is not already and grants that run (once).
 * - A connection made only for a grant ends when World Builder leaves or
 *   the run ends; one opened with Connect agents stays, as before.
 * - Disconnect agents ends both, and the tab does not grant that run again;
 *   only that declines a run. A failed connect or grant is tried again on
 *   the next remount, shown() or run change.
 * - The automatic link connects with `keep`, so it never ends another World
 *   view's session (Connect agents still replaces them, as before). One that
 *   drops (the server forgot it, a poll failed) reconnects once at once and
 *   again when the page is shown, without telling the person.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isAgentActive } from "../../shared/agent-session-events";
import { useLatestAgentSession } from "../agent/useAgentSession";
import type { connectWorld } from "./agent-bridge";
import { inComfyNode } from "./host";
import type { BuilderSession } from "./useBuilderSession";

type Connection = Awaited<ReturnType<typeof connectWorld>>;
type Connect = (
  onDisconnect: (error?: string) => void,
  /** The automatic link for a grant, which keeps other tabs' sessions. */
  keep: boolean,
) => Promise<Connection>;

export interface WorldLinkState {
  /** A connection is open. */
  connected: boolean;
  /** The one-use code, shown only after Connect agents. */
  code: string;
  /** The running session this tab granted, if any. */
  granted?: string;
}

export class WorldLink {
  private connection?: Connection;
  private pending?: { keep: boolean; promise: Promise<Connection> };
  private manual = false;
  /** The open connection was made by the automatic link (`keep`). */
  private automatic = false;
  /** Connect agents was pressed and its connection is still opening. */
  private manualPending = false;
  /** Bumped by close(): a Connect agents click from before it is void. */
  private closes = 0;
  private granted = new Set<string>();
  private declined = new Set<string>();
  /** Runs whose dropped link was reconnected once already. */
  private retried = new Set<string>();
  private run?: string;
  private listeners = new Set<() => void>();
  private snapshot: WorldLinkState = { connected: false, code: "" };
  constructor(
    private connect: Connect,
    private onError: (message: string) => void = () => {},
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  state = () => this.snapshot;
  private emit() {
    const c = this.connection;
    this.snapshot = {
      connected: !!c,
      code: c && this.manual ? c.code : "",
      ...(c && this.run && this.granted.has(this.run)
        ? { granted: this.run }
        : {}),
    };
    this.listeners.forEach((listener) => listener());
  }

  /** Whether anything on screen still needs the connection. */
  private wanted() {
    return (
      this.manual ||
      this.manualPending ||
      (!!this.run && !this.declined.has(this.run))
    );
  }

  /** Closes a connection nothing needs (World left, run ended, unmounted). */
  private release() {
    if (this.connection && !this.wanted()) this.connection.disconnect();
    else this.emit();
  }

  /**
   * The open connection, or a new one. A connect still opening is shared
   * only by a request with the same `keep`, or by the automatic link waiting
   * on Connect agents (the person's click already chose to replace other
   * tabs); toggle() never inherits an automatic connect's `keep`.
   */
  private open(keep: boolean): Promise<Connection> {
    if (this.connection) return Promise.resolve(this.connection);
    if (this.pending && (this.pending.keep === keep || keep))
      return this.pending.promise;
    const opening = this.pending?.promise.catch(() => undefined);
    const promise = (async () => {
      // Connect agents waits for an automatic connect, then replaces it.
      if (opening) {
        await opening;
        this.connection?.disconnect();
      }
      /** Set once the connect returns; an end before that is a drop. */
      const own: { c?: Connection; dropped?: boolean } = {};
      const c = await this.connect((error) => {
        // Only this connection's own end clears the link's state.
        if (!own.c) own.dropped = true;
        if (!own.c || this.connection !== own.c) return;
        const manual = this.manual,
          run = this.run;
        this.connection = undefined;
        this.manual = false;
        this.granted.clear();
        this.emit();
        if (!error) return;
        // An automatic link that dropped comes back once, quietly.
        if (!manual && run && !this.retried.has(run)) {
          this.retried.add(run);
          void this.follow(run, true);
        } else this.onError(error);
      }, keep);
      if (own.dropped) throw new Error("World disconnected.");
      own.c = c;
      return c;
    })();
    const entry = { keep, promise };
    this.pending = entry;
    return promise.then(
      (c) => {
        if (this.pending === entry) this.pending = undefined;
        this.connection = c;
        this.automatic = keep;
        // Arrived after World left or unmounted: closed at once.
        this.release();
        return c;
      },
      (e: unknown) => {
        if (this.pending === entry) this.pending = undefined;
        throw e;
      },
    );
  }

  /**
   * The page's state: on screen or not, and the person's running session.
   * Grants that run, connecting first; a connection only a grant needed
   * closes once there is nothing on screen to grant. A failed connect or
   * grant (a full server, a run that ended) is not a decline: the next
   * remount, shown() or run change tries again. Only Disconnect agents
   * declines a run.
   */
  async follow(run: string | undefined, onScreen: boolean) {
    this.run = onScreen ? run : undefined;
    const want = this.run;
    if (!want || this.declined.has(want)) return this.release();
    if (this.connection && this.granted.has(want)) return this.emit();
    try {
      const c = await this.open(true);
      // The page moved on while the connection opened: no grant.
      if (this.run !== want || this.connection !== c) return this.release();
      await c.grant(want);
      if (this.run === want && this.connection === c) {
        this.granted.add(want);
        return this.emit();
      }
      // It moved on while the grant was made: take it back. A closed
      // connection took every grant with it already.
      if (this.connection === c) {
        if (this.wanted()) await c.revoke(want);
        else c.disconnect();
      }
    } catch {
      // An automatic connection that could not grant is not kept open.
      if (this.connection && !this.manual && !this.manualPending)
        this.connection.disconnect();
      else this.emit();
    }
  }

  /** Connect agents / Disconnect agents. */
  async toggle() {
    if (this.connection && (this.manual || this.granted.size)) {
      if (this.run) this.declined.add(this.run);
      this.manual = false;
      this.connection.disconnect();
      return;
    }
    const closes = this.closes;
    this.manualPending = true;
    try {
      // An open automatic connection is replaced, as Connect agents always
      // replaced the owner's other World sessions.
      if (this.connection && this.automatic) this.connection.disconnect();
      await this.open(false);
    } finally {
      this.manualPending = false;
    }
    // Unmounted while it opened: release() has closed it.
    if (closes !== this.closes || !this.connection) return this.release();
    this.manual = true;
    this.emit();
    // The replaced connection took its grant: grant the run again here.
    if (this.run) void this.follow(this.run, true);
  }

  /** The page is shown again: a dropped link may reconnect once more. */
  shown() {
    this.retried.clear();
    if (this.run) void this.follow(this.run, true);
  }

  /**
   * The page unmounts: nothing is wanted any more, so the open connection
   * closes now and one still opening closes when it arrives, ungranted.
   */
  close() {
    this.closes++;
    this.run = undefined;
    this.manual = false;
    this.manualPending = false;
    this.connection?.disconnect();
  }
}

/** The running session the tab may grant: the one the studio follows. */
function useRunningSession() {
  const session = useLatestAgentSession();
  return session && isAgentActive(session.status) && !session.localSessionUrl
    ? session.id
    : undefined;
}

export function useWorldLink(
  s: BuilderSession,
  active: boolean,
  connect: Connect,
) {
  const [link] = useState(
    () =>
      new WorldLink(connect, (error) =>
        s.run(() => Promise.reject(new Error(error))),
      ),
  );
  const state = useSyncExternalStore(link.subscribe, link.state, link.state);
  const run = useRunningSession();
  const wanted = !inComfyNode() && s.ready;
  const latest = useRef({ run, active, wanted });
  latest.current = { run, active, wanted };
  useEffect(() => () => link.close(), [link]);
  useEffect(() => {
    const shown = () => {
      if (document.visibilityState === "visible") link.shown();
    };
    // Leaving the page ends its session now (the DELETE is sent with
    // keepalive), not after the server's sweep; a page restored from the
    // back/forward cache links again.
    const hide = () => link.close();
    const restore = (event: PageTransitionEvent) => {
      const { run, active, wanted } = latest.current;
      if (event.persisted && wanted) void link.follow(run, active);
    };
    document.addEventListener("visibilitychange", shown);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restore);
    return () => {
      document.removeEventListener("visibilitychange", shown);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restore);
    };
  }, [link]);
  useEffect(() => {
    if (wanted) void link.follow(run, active);
  }, [link, run, active, wanted]);
  return { state, toggle: () => link.toggle() };
}
