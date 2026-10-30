// One-use tickets that sign an agent's own browser into the studio
// (server/agent-sessions.ts): random, ten minutes, each naming its session.
import { randomBytes } from "node:crypto";

const TICKET_MS = 10 * 60_000;

export class AgentTickets {
  private tickets = new Map<string, { id: string; expires: number }>();

  /** A new ticket for session `id`. */
  issue(id: string) {
    const ticket = randomBytes(24).toString("base64url");
    this.tickets.set(ticket, { id, expires: Date.now() + TICKET_MS });
    return ticket;
  }

  /** Spends a ticket: its session id, or undefined when unknown or expired. */
  take(ticket: string) {
    const now = Date.now();
    for (const [key, entry] of this.tickets)
      if (entry.expires <= now) this.tickets.delete(key);
    const entry = /^[A-Za-z0-9_-]{32}$/.test(ticket)
      ? this.tickets.get(ticket)
      : undefined;
    if (entry) this.tickets.delete(ticket);
    return entry?.id;
  }

  /** The session ended: its unspent tickets go with it. */
  forget(id: string) {
    for (const [key, entry] of this.tickets)
      if (entry.id === id) this.tickets.delete(key);
  }
}
