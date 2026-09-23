-- migrations/007_alter_trading_accounts_user_id.sql
-- Alters the user_id column in trading_accounts to store UUID strings.
-- Auth service manages users with UUID identifiers, while trade service
-- stores the UUID as a string reference without a foreign key constraint.
--
-- This maintains separation of concerns: Auth owns users and identity,
-- Trade owns accounts and trading logic. They communicate via UUID reference.

BEGIN;

-- Drop any foreign key constraint that might exist (if any)
ALTER TABLE trading_accounts DROP CONSTRAINT IF EXISTS fk_accounts_user;

-- Change user_id from BIGINT to VARCHAR(36) to store UUID strings
ALTER TABLE trading_accounts
    ALTER COLUMN user_id TYPE VARCHAR(36);

-- Add index for lookup performance
CREATE INDEX idx_trading_accounts_user_id
    ON trading_accounts(user_id);

COMMIT;
