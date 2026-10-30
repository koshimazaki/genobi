import { expireStaleJob } from "../shared/lifecycle";
import type { Store } from "./store";

/**
 * The local mirror of the Worker sweep: nothing may stay non-terminal
 * forever, whichever backend recorded it. Retention and media deletion stay a
 * cloud concern — the local store is a developer's own work and keeps it.
 */
export async function sweepJobs(store: Store, now = Date.now()) {
  let changed = false;
  for (const job of store.data.jobs)
    if (expireStaleJob(job, Date.parse(job.createdAt), now)) changed = true;
  const quotes = store.data.quotes.filter(
    (quote) => Date.parse(quote.expiresAt) > now,
  );
  if (quotes.length !== store.data.quotes.length) {
    store.data.quotes = quotes;
    changed = true;
  }
  if (changed) await store.save();
}
