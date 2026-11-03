/**
 * Camera's generation queue: one more run of the composer, added while a run
 * is in flight. Every run is its own submission (its own Idempotency-Key and,
 * where the route asks, its own quote and confirmation), sent as soon as the
 * one before it has been accepted by the server, not when its job finishes.
 *
 * The queue never retries. A failed quote (nothing sent), a refusal (budget,
 * session limit, a bad request) or an uncertain submission (a lost connection, a server error, an answer
 * that could not be read) stops it, and every run still waiting is dropped
 * with a note, so a paid run can never be sent twice by the queue.
 *
 * No framework here: `useGenerationQueue` wraps it for the studio.
 */

/** Why the queue stopped, and the words it shows. */
export type QueueHalt = "refused" | "uncertain" | "quote" | "declined" | "left";

const QUOTE_FAILED = Symbol("quote failed");

/**
 * Marks an error raised by the quote read, before any submission: nothing
 * was sent, so its note must say so and never that a run may have started.
 */
export function quoteFailure(error: unknown): Error {
  const failed = error instanceof Error ? error : new Error(String(error));
  return Object.assign(failed, { [QUOTE_FAILED]: true });
}

const isQuoteFailure = (error: unknown) =>
  Boolean((error as { [QUOTE_FAILED]?: boolean } | null)?.[QUOTE_FAILED]);

/** A 4xx is a server refusal: it answered and created nothing. */
export function isRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

const runs = (n: number) => `${n} queued run${n === 1 ? "" : "s"}`;

/**
 * The note a stop leaves. `queued` says whether the run that stopped it was
 * itself a queued one; a lone manual run's failure reads as it always has.
 */
export function haltNote(
  kind: QueueHalt,
  dropped: number,
  message = "",
  queued = false,
): string {
  const unsent = dropped
    ? ` The queue stopped: ${runs(dropped)} ${dropped === 1 ? "was" : "were"} not sent.`
    : "";
  if (kind === "left")
    return `You left Camera, so ${runs(dropped)} ${dropped === 1 ? "was" : "were"} not sent. Runs already sent keep going in the gallery.`;
  if (kind === "declined")
    return dropped ? `A queued run was not approved.${unsent}` : "";
  const base = message || "The generation could not start.";
  if (kind === "quote")
    return `${message || "The quote could not be read."} The quote failed, so nothing was sent.${unsent}`;
  if (kind === "refused") return `${base}${unsent}`;
  const uncertain =
    queued || dropped
      ? " This run may have started, so it was not retried: check the gallery before sending it again."
      : "";
  return `${base}${uncertain}${unsent}`;
}

export interface QueueEvents {
  /** The waiting count or the sending flag changed. */
  change: (state: { queued: number; sending: boolean }) => void;
  /** The queue stopped; `note` is empty when there is nothing to say. */
  halt: (note: string) => void;
}

/**
 * Sends runs one at a time. `send` resolves `true` once the server accepted
 * the run, `false` when the person declined its confirmation, and rejects
 * when the server refused it or the outcome is unknown.
 */
export class GenerationQueue<T> {
  private pending: T[] = [];
  private sending = false;
  constructor(
    private send: (run: T) => Promise<boolean>,
    private events: QueueEvents,
  ) {}

  get queued() {
    return this.pending.length;
  }
  get busy() {
    return this.sending;
  }

  /** Sends now when idle; otherwise waits for the run before it. */
  add(run: T) {
    this.pending.push(run);
    this.emit();
    if (!this.sending) void this.pump();
  }

  /** Drops every run not yet sent. A run being sent is the server's now. */
  clear(): number {
    const dropped = this.pending.length;
    this.pending = [];
    this.emit();
    return dropped;
  }

  /** Leaving Camera: unsent runs go, with a notice when there were any. */
  leave() {
    const dropped = this.clear();
    if (dropped) this.events.halt(haltNote("left", dropped));
  }

  private emit() {
    this.events.change({ queued: this.pending.length, sending: this.sending });
  }

  private async pump() {
    this.sending = true;
    // The first run of a burst is the click that started it, not a queued one.
    let queued = false;
    for (let run = this.pending.shift(); run !== undefined;) {
      this.emit();
      try {
        if (!(await this.send(run))) {
          this.stop(haltNote("declined", this.pending.length));
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const kind = isQuoteFailure(error)
          ? "quote"
          : isRefusal(error)
            ? "refused"
            : "uncertain";
        this.stop(haltNote(kind, this.pending.length, message, queued));
        return;
      }
      queued = true;
      run = this.pending.shift();
    }
    this.sending = false;
    this.emit();
  }

  private stop(note: string) {
    this.pending = [];
    this.sending = false;
    this.emit();
    this.events.halt(note);
  }
}
