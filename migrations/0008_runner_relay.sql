-- Outbound paired runners. Credentials are hashes, and provider keys never enter this relay.
CREATE TABLE runner_pairs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL UNIQUE,
  code_hash TEXT,
  code_expires INTEGER NOT NULL,
  token_hash TEXT,
  runner TEXT,
  local_origin TEXT,
  last_seen INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE runner_sessions (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  pair_id TEXT NOT NULL,
  request TEXT NOT NULL,
  view TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'queued',
  stop_requested INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX runner_sessions_owner ON runner_sessions(owner, created);
CREATE INDEX runner_sessions_queue ON runner_sessions(pair_id, phase, created);
CREATE UNIQUE INDEX runner_one_active ON runner_sessions(pair_id)
  WHERE phase IN ('queued', 'claimed', 'running');
