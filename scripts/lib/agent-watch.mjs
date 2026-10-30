// The watcher's loop: read the session, fold each read into the record,
// write the log on every change, and stop when the session has ended. The
// reader, clock and sleep are passed in, so a test can run it against a
// scripted session; scripts/watch-agent-session.mjs supplies the real ones.
import { finish, observe, settled } from "./agent-log.mjs";

/** A read that failed: `connection` and `server` are retried, `rate` waits longer. */
export class ReadError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind;
  }
}

/** Connection retries before the watch gives up with exit code 2. */
export const RETRIES = 3;
/** The longest wait after a 429 from the poll bucket. */
export const RATE_WAIT_MAX_MS = 30_000;

/** One short terminal line for a change. */
export function describe(events, record) {
  const count = (kind) => events.filter((e) => e.kind === kind).length;
  const parts = [record.status ?? "unknown"];
  const lines = count("line");
  if (lines) parts.push(`${lines} new line${lines === 1 ? "" : "s"}`);
  for (const kind of ["approval", "result", "gap", "summary", "connection"])
    if (count(kind)) parts.push(`${count(kind)} ${kind}`);
  const end = events.find((e) => e.kind === "end");
  if (end) parts.push(`ended: ${end.text}`);
  return parts.join(" · ");
}

/**
 * Watches until the session ends or cannot be read. Returns the exit code:
 * 0 done, 1 failed, stopped or interrupted (or waiting with a step left
 * unstarted), 2 the session could not be read (after `RETRIES` connection
 * retries, or at once for an answer such as 404).
 */
export async function watch({
  read,
  record,
  intervalMs,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onChange = async () => {},
}) {
  const iso = () => new Date(now()).toISOString();
  let failures = 0;
  let wait = intervalMs;
  for (;;) {
    let session;
    try {
      session = await read();
      failures = 0;
      wait = intervalMs;
    } catch (error) {
      const kind = error instanceof ReadError ? error.kind : "connection";
      const at = iso();
      if (kind === "rate") {
        wait = Math.min(wait * 2, RATE_WAIT_MAX_MS);
        const event = {
          at,
          kind: "connection",
          text: `The studio asked the watcher to slow down; next read in ${Math.round(wait / 1000)} s.`,
        };
        record.events.push(event);
        await onChange(record, [event]);
        await sleep(wait);
        continue;
      }
      if (
        (kind === "connection" || kind === "server") &&
        ++failures <= RETRIES
      ) {
        const event = {
          at,
          kind: "connection",
          text: `${error.message} Retry ${failures} of ${RETRIES}.`,
        };
        record.events.push(event);
        await onChange(record, [event]);
        await sleep(intervalMs);
        continue;
      }
      finish(record, `could not read the session: ${error.message}`, at);
      await onChange(record, record.events.slice(-1));
      return 2;
    }
    const at = iso();
    const events = observe(record, session, at);
    const verdict = settled(record, session, now());
    if (verdict) {
      finish(record, verdict.outcome, at);
      events.push(record.events.at(-1));
    }
    if (events.length) await onChange(record, events);
    if (verdict) return verdict.code;
    await sleep(wait);
  }
}
