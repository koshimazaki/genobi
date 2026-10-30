-- SHA-256 of each upload's bytes, recorded as it streams into R2 and read by
-- the take of any run that uses it (shared/take.ts). Beside the source, never
-- in its public data. NULL for generated media and rows from before hashes.
ALTER TABLE sources ADD COLUMN sha256 TEXT;
