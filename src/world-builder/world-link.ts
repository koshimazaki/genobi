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
 * - Disconnect agents ends both, and the tab does not grant that run again.
 * - The automatic link connects with `keep`, so it never ends another World
 *   view's session (Connect agents still replaces them, as before). One that
 *   drops (the server forgot it, a poll failed) reconnects once at once and
 *   again when the page is shown, without telling the person.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
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
  private pending?: Promise<Connection>;
  private manual = false;
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

  private open(keep: boolean) {
    if (this.connection) return Promise.resolve(this.connection);
    this.pending ??= this.connect((error) => {
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
    }, keep).then(
      (c) => {
        this.connection = c;
        this.pending = undefined;
        this.emit();
        return c;
      },
      (e: unknown) => {
        this.pending = undefined;
        throw e;
      },
    );
    return this.pending;
  }

  /**
   * The page's state: on screen or not, and the person's running session.
   * Grants that run, connecting first; a connection only a grant needed
   * closes once there is nothing on screen to grant.
   */
  async follow(run: string | undefined, onScreen: boolean) {
    this.run = onScreen ? run : undefined;
    const want = this.run;
    if (!want || this.declined.has(want)) {
      if (this.connection && !this.manual) this.connection.disconnect();
      else this.emit();
      return;
    }
    if (this.connection && this.granted.has(want)) return this.emit();
    try {
      const c = await this.open(true);
      // The page moved on while the connection opened.
      if (this.run !== want || this.connection !== c) return;
      await c.grant(want);
      this.granted.add(want);
      this.emit();
    } catch {
      // Not again for this run: a failed grant is the manual path's job.
      this.declined.add(want);
      if (this.connection && !this.manual) this.connection.disconnect();
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
    await this.open(false);
    this.manual = true;
    this.emit();
  }

  /** The page is shown again: a dropped link may reconnect once more. */
  shown() {
    this.retried.clear();
    if (this.run) void this.follow(this.run, true);
  }

  /** The page unmounts. */
  close() {
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
  useEffect(() => () => link.close(), [link]);
  useEffect(() => {
    const shown = () => {
      if (document.visibilityState === "visible") link.shown();
    };
    document.addEventListener("visibilitychange", shown);
    return () => document.removeEventListener("visibilitychange", shown);
  }, [link]);
  useEffect(() => {
    if (inComfyNode() || !s.ready) return;
    void link.follow(run, active);
  }, [link, run, active, s.ready]);
  return { state, toggle: () => link.toggle() };
}
