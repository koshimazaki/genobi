CREATE TABLE jobs (
 id TEXT PRIMARY KEY, session TEXT NOT NULL, idempotency TEXT NOT NULL,
 input TEXT NOT NULL, data TEXT NOT NULL, polling_url TEXT, remote_url TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
 UNIQUE(session, idempotency)
);
CREATE INDEX jobs_session ON jobs(session, created_at DESC);
CREATE TABLE sources (id TEXT PRIMARY KEY, session TEXT NOT NULL, data TEXT NOT NULL, object_key TEXT NOT NULL, bytes INTEGER NOT NULL);
CREATE INDEX sources_session ON sources(session);
CREATE TABLE shares (token TEXT PRIMARY KEY, object_key TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE rate_limits (id TEXT PRIMARY KEY, starts INTEGER NOT NULL, count INTEGER NOT NULL);
