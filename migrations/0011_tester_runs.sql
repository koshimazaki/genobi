-- Hosted tester access (docs/tester-access.md). One row per access code, keyed
-- by a SHA-256 of the code, never the code itself: how many capped runs it has
-- reserved, and when. Counts and timestamps only.
CREATE TABLE tester_runs (
 code_hash TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
