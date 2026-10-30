/**
 * One session setting's single sequencing point, shared by every reader and
 * writer of it for as long as the page lives: a control's save or read, a
 * Recreate restore and the startup read (`src/settings-store.ts`).
 *
 * - Answers are ordered by the server's settings revision, not by when they
 *   arrive: one is applied only when its revision is newer than the last
 *   applied. A read the server handled before a write carries the older
 *   revision, so it can never land after the write's answer and replace it.
 * - Any write in flight holds Generate and Approve (`saving`).
 * - A write that ends without a value leaves the setting unconfirmed, which
 *   also holds them, until an answer is applied: a control may still show
 *   the choice it sent while the server holds another.
 * - A request that ends without a value (aborted, refused or lost) owes a
 *   fresh read through the lane once nothing is in flight: a lost write's
 *   revision is unknown, and the server may hold it. An automatic read that
 *   itself ends empty starts no other; the setting stays unconfirmed (and
 *   held) until a later read or save is answered.
 */
export type Settled<T> =
  | { current: boolean; ok: true; value: T }
  | { current: boolean; ok: false; error: Error };

/** What a control of the setting shows: the server's value and whether confirmed. */
export type LaneView<T> = { value?: T; confirmed?: boolean };

export class SettingLane<T extends { revision: number }> {
  /** The newest request's number. */
  latest = 0;
  /** How many writes are in flight: any of them holds Generate. */
  saving = 0;
  /**
   * Whether what the store shows is the server's own answer: undefined until
   * a request says, so a setting nothing has read yet holds nothing.
   */
  confirmed?: boolean;
  /** The last applied answer: the newest revision seen. */
  current?: T;
  private readonly inflight = new Set<number>();
  /** A read is owed once nothing is in flight. */
  private owed = false;
  private readonly views = new Set<(view: LaneView<T>) => void>();

  constructor(
    /** The fresh read the lane starts on its own to converge. */
    private readonly reread: () => Promise<T | null>,
    /** Notes an applied answer where paid writes read it. */
    private readonly apply: (value: T) => void = () => {},
    /** Called after every change to `saving` or `confirmed`. */
    private readonly changed: () => void = () => {},
  ) {}

  /** A control showing this setting; returns how to stop. */
  watch(view: (view: LaneView<T>) => void) {
    this.views.add(view);
    return () => void this.views.delete(view);
  }

  private show(view: LaneView<T>) {
    for (const each of this.views) each(view);
  }

  /**
   * Applies `value` if the server handled it after the last applied answer.
   * The same revision is the same server state: it confirms what is shown.
   */
  private offer(value: T) {
    if (this.current && value.revision < this.current.revision) return false;
    if (this.current?.revision === value.revision) value = this.current;
    this.current = value;
    this.confirmed = true;
    this.apply(value);
    this.show({ value, confirmed: true });
    return true;
  }

  private unconfirm() {
    this.confirmed = false;
    this.show({ confirmed: false });
  }

  /** A read is owed or in flight to learn what the server holds. */
  get checking() {
    return this.owed || this.inflight.size > 0;
  }

  /**
   * Sends one numbered request. Resolves once it, and any read the lane
   * started on its own because of it, has settled; never rejects. `current`
   * says whether its answer was applied.
   */
  async run(
    kind: "read" | "write",
    send: () => Promise<T | null>,
    automatic = false,
  ): Promise<Settled<T | null>> {
    const id = ++this.latest;
    this.inflight.add(id);
    if (kind === "write") this.saving++;
    this.changed();
    let answer: Settled<T | null>;
    try {
      answer = { current: false, ok: true, value: await send() };
    } catch (error) {
      answer = {
        current: false,
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    this.inflight.delete(id);
    const value = answer.ok ? answer.value : null;
    if (value) answer.current = this.offer(value);
    else if (kind === "write" || (automatic && this.current))
      // A write without an answer leaves what the server holds unknown, and
      // a control may still show the choice it sent: unconfirmed, which
      // holds Generate and Approve, until an answer is applied. An automatic
      // read that ends empty (the loop guard) leaves it so.
      this.unconfirm();
    if (!value && !automatic) this.owed = true;
    if (kind === "write") this.saving--;
    this.changed();
    if (this.owed && this.inflight.size === 0) {
      this.owed = false;
      await this.run("read", this.reread, true);
    }
    return answer;
  }
}
