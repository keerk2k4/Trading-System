-- migrations/018_add_lookup_hashes.sql
-- Uniqueness for encrypted fields.
--
-- phone, document_type and document_number are stored as randomized
-- AES-256-GCM ciphertext (auth-service FieldEncryptionService), so equal
-- values never look equal in SQL. auth-service therefore also stores a
-- deterministic HMAC-SHA256 "lookup hash" of each normalized value and the
-- database enforces uniqueness on that:
--   auth.users.phone_lookup_hash    -> one account per phone number
--   auth.kyc.document_lookup_hash   -> one KYC per document type + number
--
-- The hashes are computed only by auth-service (they need its key), so rows
-- inserted by plain SQL (e.g. seed/001_auth_test_users.sql) have NULL; the
-- partial indexes ignore NULLs.
--
-- The index names are referenced by auth-service (PHONE_UNIQUE_INDEX,
-- DOCUMENT_UNIQUE_INDEX) to map a unique violation to a readable error.

BEGIN;

ALTER TABLE IF EXISTS auth.users
    ADD COLUMN IF NOT EXISTS phone_lookup_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_users_phone_lookup_hash
    ON auth.users (phone_lookup_hash)
    WHERE phone_lookup_hash IS NOT NULL;

-- document_type now holds ciphertext as well.
ALTER TABLE IF EXISTS auth.kyc
    ALTER COLUMN document_type TYPE TEXT;

ALTER TABLE IF EXISTS auth.kyc
    ADD COLUMN IF NOT EXISTS document_lookup_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_kyc_document_lookup_hash
    ON auth.kyc (document_lookup_hash)
    WHERE document_lookup_hash IS NOT NULL;

COMMIT;
