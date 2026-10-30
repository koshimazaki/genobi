-- The lifecycle sweep finds rows by age, so give it indexes instead of scans.
CREATE INDEX jobs_created ON jobs(created_at);
CREATE INDEX shares_expires ON shares(expires);
CREATE INDEX rate_limits_starts ON rate_limits(starts);
-- Stored media is deleted with the record that owns it, so sources need an age.
ALTER TABLE sources ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE sources SET created_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE created_at = 0;
