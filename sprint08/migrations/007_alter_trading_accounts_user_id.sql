-- migrations/007_alter_trading_accounts_user_id.sql
-- Converts user_id columns to support auth service with UUID identifiers.
--
-- This migration:
-- 1. Converts users.user_id from BIGINT to UUID (in-place, preserves users table)
-- 2. Converts trading_accounts.user_id from BIGINT to VARCHAR(36) to store UUID references
--
-- After this migration:
-- - users table still exists in public schema with UUID primary keys
-- - auth schema will be created in migration 008 and users will be moved there
-- - trading_accounts will store UUID strings in user_id (no FK constraint)
-- - This maintains microservice separation

BEGIN;

-- ============================================================
-- STEP 0: Drop all FK constraints that reference users.user_id
-- ============================================================
-- Drop dependent foreign key from trading_accounts first
ALTER TABLE IF EXISTS trading_accounts DROP CONSTRAINT IF EXISTS fk_trading_accounts_user;
ALTER TABLE IF EXISTS trading_accounts DROP CONSTRAINT IF EXISTS fk_accounts_user;
ALTER TABLE IF EXISTS accounts DROP CONSTRAINT IF EXISTS fk_accounts_user;

-- Drop the watchlist foreign key to users (will be recreated in migration 008)
ALTER TABLE IF EXISTS watchlist DROP CONSTRAINT IF EXISTS fk_watchlist_user;

-- Drop the watchlist FK to trading_accounts if it exists (in case of re-runs)
ALTER TABLE IF EXISTS watchlist DROP CONSTRAINT IF EXISTS fk_watchlist_trading_account;

-- ============================================================
-- STEP 1: Convert users.user_id from BIGINT to UUID
-- ============================================================

-- Convert the primary key column type from BIGINT to UUID (in-place, no DROP TABLE)
-- Step 1: Drop the primary key constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;

-- Step 2: Convert the column type with data migration
ALTER TABLE users 
ALTER COLUMN user_id TYPE UUID USING
  CASE 
    WHEN user_id = 1 THEN '550e8400-e29b-41d4-a716-446655440001'::uuid
    WHEN user_id = 2 THEN '550e8400-e29b-41d4-a716-446655440002'::uuid
    WHEN user_id = 3 THEN '550e8400-e29b-41d4-a716-446655440003'::uuid
    WHEN user_id = 4 THEN '550e8400-e29b-41d4-a716-446655440004'::uuid
    WHEN user_id = 5 THEN '550e8400-e29b-41d4-a716-446655440005'::uuid
    ELSE gen_random_uuid()
  END;

-- Step 3: Recreate the primary key constraint
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);

-- Step 4: Create indexes for lookup performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

-- ============================================================
-- STEP 2: Convert trading_accounts.user_id to VARCHAR(36)
-- ============================================================
-- Update user_id values to UUID strings
ALTER TABLE trading_accounts
    ALTER COLUMN user_id TYPE VARCHAR(36);

-- Update existing data with proper UUID format
UPDATE trading_accounts 
SET user_id = CASE 
    WHEN user_id = '1' THEN '550e8400-e29b-41d4-a716-446655440001'
    WHEN user_id = '2' THEN '550e8400-e29b-41d4-a716-446655440002'
    WHEN user_id = '3' THEN '550e8400-e29b-41d4-a716-446655440003'
    WHEN user_id = '4' THEN '550e8400-e29b-41d4-a716-446655440004'
    WHEN user_id = '5' THEN '550e8400-e29b-41d4-a716-446655440005'
    ELSE user_id
END;

-- ============================================================
-- STEP 3: Convert watchlist.user_id to UUID
-- ============================================================
-- Convert watchlist.user_id from BIGINT to UUID to match users table
ALTER TABLE watchlist
ALTER COLUMN user_id TYPE UUID USING
  CASE 
    WHEN user_id = 1 THEN '550e8400-e29b-41d4-a716-446655440001'::uuid
    WHEN user_id = 2 THEN '550e8400-e29b-41d4-a716-446655440002'::uuid
    WHEN user_id = 3 THEN '550e8400-e29b-41d4-a716-446655440003'::uuid
    WHEN user_id = 4 THEN '550e8400-e29b-41d4-a716-446655440004'::uuid
    WHEN user_id = 5 THEN '550e8400-e29b-41d4-a716-446655440005'::uuid
    ELSE gen_random_uuid()
  END;

COMMIT;
