-- One-use price confirmations (shared/quote.ts). A quote is spent by setting
-- `job` in the same transaction that reserves the run, and the sweep drops it
-- once expired: an expired quote can never be spent, and the run it paid for
-- keeps its own replay row.
CREATE TABLE quotes (
 id TEXT PRIMARY KEY, session TEXT NOT NULL, settings TEXT NOT NULL,
 data TEXT NOT NULL, expires INTEGER NOT NULL, job TEXT
);
CREATE INDEX quotes_expires ON quotes(expires);
