-- migrations/011_encrypt_email_storage.sql
-- Prepares the email columns for application-level AES-256-GCM ciphertext.
--
-- Why this migration is needed:
-- 1. Ciphertext (`ivHex:authTagHex:dataHex`) is ~2x plaintext + 58 chars
--    overhead, so VARCHAR(255) overflows for long emails -> widen to TEXT.
-- 2. Randomized IV means the same email encrypts to a different string on
--    every write, so a UNIQUE constraint / btree index on the raw column can
--    no longer enforce or look up plaintext uniqueness. Uniqueness stays on
--    user_name (checked in UserRepository.isUsernameTaken); email lookup by
--    plaintext SQL is retired (auth-service only queries by user_name/id).
-- 3. Encryption itself happens in auth-service EmailEncryptionService on
--    write + decryption on read; existing plaintext rows keep reading via
--    decrypt() pass-through until rewritten.
--
-- Rollout: deploy auth-service with EMAIL_ENCRYPTION_KEY set, then backfill
-- legacy plaintext rows by re-saving users (each re-save encrypts).

BEGIN;

-- Widen both copies of the users table for ciphertext.
ALTER TABLE IF EXISTS trading.users
    ALTER COLUMN email TYPE TEXT;

ALTER TABLE IF EXISTS auth.users
    ALTER COLUMN email TYPE TEXT;

-- UNIQUE on randomized ciphertext is misleading (never matches), drop it
-- where it exists. Name comes from 001 `email VARCHAR(255) NOT NULL UNIQUE`.
ALTER TABLE IF EXISTS trading.users
    DROP CONSTRAINT IF EXISTS users_email_key;

ALTER TABLE IF EXISTS auth.users
    DROP CONSTRAINT IF EXISTS users_email_key;

ALTER TABLE IF EXISTS auth.users
    DROP CONSTRAINT IF EXISTS auth_users_email_key;

-- Plain btree indexes on the raw column cannot serve plaintext email
-- lookups once ciphertext lands; drop them to avoid implying otherwise.
DROP INDEX IF EXISTS auth.idx_auth_users_email;
DROP INDEX IF EXISTS trading.idx_auth_users_email;
DROP INDEX IF EXISTS public.idx_users_email;

COMMIT;
