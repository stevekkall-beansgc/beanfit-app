-- 0004: a pair ID may report status but must never be sufficient to retrieve
-- a device credential. The CLI receives a separate start-time secret; only
-- its digest is persisted. Existing raw credential remnants are scrubbed.
ALTER TABLE devices ADD COLUMN pair_claim_hash TEXT;
ALTER TABLE devices ADD COLUMN revoked_at TEXT;
UPDATE devices SET device_token = NULL;
