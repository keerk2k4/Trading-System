-- migrations/017_encrypt_phone_and_kyc_fields.sql
-- Prepares auth.users.phone, auth.kyc.date_of_birth and
-- auth.kyc.document_number for application-level AES-256-GCM ciphertext
-- (auth-service FieldEncryptionService), the same approach migration 011
-- took for email.
--
-- Why this migration is needed:
-- 1. Ciphertext (`ivHex:authTagHex:dataHex`) is ~2x plaintext + 58 chars,
--    so VARCHAR(30) / VARCHAR(100) overflow, and DATE cannot hold it at all
--    -> all three become TEXT.
-- 2. A randomized IV makes the same value encrypt differently every time, so
--    a btree index on the raw column can never serve a lookup -> drop the
--    phone index rather than imply otherwise.
--
-- Any plaintext rows keep reading: date_of_birth is converted to its
-- YYYY-MM-DD text form, and FieldEncryptionService.decrypt() passes
-- plaintext through unchanged.

BEGIN;

ALTER TABLE IF EXISTS auth.users
    ALTER COLUMN phone TYPE TEXT;

DROP INDEX IF EXISTS auth.idx_auth_users_phone;

-- Guarded so re-running the migration on an already-converted table is a no-op.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'kyc'
          AND column_name = 'date_of_birth' AND data_type = 'date'
    ) THEN
        ALTER TABLE auth.kyc
            ALTER COLUMN date_of_birth TYPE TEXT USING to_char(date_of_birth, 'YYYY-MM-DD');
    END IF;
END $$;

ALTER TABLE IF EXISTS auth.kyc
    ALTER COLUMN document_number TYPE TEXT;

COMMIT;
