-- What only the reservation knows about a take: the recipe that ran and the
-- hashes of its inputs (shared/take.ts). Beside the job, never in its public
-- data, and gone with the job at retention. NULL on runs from before takes.
ALTER TABLE jobs ADD COLUMN take TEXT;
