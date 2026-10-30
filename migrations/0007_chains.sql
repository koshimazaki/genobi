-- Chained jobs (shared/chain.ts): ordered paid stages with an approval between
-- each. A stage's run is an ordinary row in `jobs`, found by its idempotency
-- key, so this row holds only the stages, the quote each pause offers and the
-- approval, recorded before its stage is submitted. Every change is a
-- compare-and-set on `revision`. Retention removes it with the jobs.
CREATE TABLE chains (
 id TEXT PRIMARY KEY, session TEXT NOT NULL, data TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX chains_session ON chains(session, created_at DESC);
