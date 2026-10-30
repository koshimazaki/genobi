-- Product counts that outlive retention. The sweep aggregates each UTC day
-- while its detail rows still exist, so deleting those rows at 30 days costs
-- the detail and not the numbers. Aggregate first, discard detail after: no
-- row here identifies a visitor, a session or a prompt.
CREATE TABLE daily_stats (
 day TEXT PRIMARY KEY,
 generations INTEGER NOT NULL DEFAULT 0,
 sessions INTEGER NOT NULL DEFAULT 0,
 ready INTEGER NOT NULL DEFAULT 0,
 failed INTEGER NOT NULL DEFAULT 0,
 drafts INTEGER NOT NULL DEFAULT 0,
 upscales INTEGER NOT NULL DEFAULT 0,
 spend_usd REAL NOT NULL DEFAULT 0
);
