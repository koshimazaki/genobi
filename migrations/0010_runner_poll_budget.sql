-- Each authenticated runner poll is one atomic D1 write: heartbeat + strict
-- per-pair fixed-window ceiling. Replaces a separate rate_limits write on
-- every three-second heartbeat without weakening cross-isolate enforcement.
ALTER TABLE runner_pairs ADD COLUMN poll_window INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runner_pairs ADD COLUMN poll_count INTEGER NOT NULL DEFAULT 0;
