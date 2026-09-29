-- migrations/008_create_schemas_and_migrate_tables.sql
-- Organizes the database into two logical schemas:
-- - auth: Authentication and user management (users, refresh_tokens)
-- - trading: Trading-related entities (users, accounts, instruments, orders, etc.)
--
-- This migration:
-- 1. Creates both schemas
-- 2. Moves users to trading schema (retained as primary)
-- 3. Creates auth.users as a copy for auth service use
-- 4. Moves refresh_tokens to auth schema
-- 5. Moves all other trading tables to trading schema
-- 6. Restores foreign key constraints

BEGIN;

-- ============================================================
-- CREATE SCHEMAS
-- ============================================================

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS trading;

-- ============================================================
-- MIGRATE TABLES TO SCHEMAS
-- ============================================================

-- Users table: Move to trading schema (primary location)
ALTER TABLE IF EXISTS users SET SCHEMA trading;

-- Copy users table structure to auth schema
CREATE TABLE IF NOT EXISTS auth.users AS 
TABLE trading.users WITH NO DATA;

-- Add indexes to auth.users
CREATE INDEX idx_auth_users_email ON auth.users(email);
CREATE INDEX idx_auth_users_phone ON auth.users(phone) WHERE phone IS NOT NULL;

-- Refresh tokens table: Move to auth schema
ALTER TABLE IF EXISTS refresh_tokens SET SCHEMA auth;

-- Trading-related tables: Move to trading schema
ALTER TABLE IF EXISTS trading_accounts SET SCHEMA trading;
ALTER TABLE IF EXISTS instruments SET SCHEMA trading;
ALTER TABLE IF EXISTS orders SET SCHEMA trading;
ALTER TABLE IF EXISTS order_history SET SCHEMA trading;
ALTER TABLE IF EXISTS positions SET SCHEMA trading;
ALTER TABLE IF EXISTS holdings SET SCHEMA trading;
ALTER TABLE IF EXISTS watchlist SET SCHEMA trading;
ALTER TABLE IF EXISTS watchlist_inst SET SCHEMA trading;


-- ============================================================
-- UPDATE FOREIGN KEY CONSTRAINTS
-- ============================================================

-- Restore FK constraint from watchlist to trading.users
-- (watchlist.user_id column already exists from earlier migrations)
ALTER TABLE trading.watchlist
DROP CONSTRAINT IF EXISTS fk_watchlist_user;

ALTER TABLE trading.watchlist
DROP CONSTRAINT IF EXISTS fk_watchlist_trading_account;

ALTER TABLE trading.watchlist
ADD CONSTRAINT fk_watchlist_user
    FOREIGN KEY (user_id)
    REFERENCES trading.users(user_id)
    ON DELETE CASCADE;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON trading.watchlist(user_id);

-- Update orders FK to reference trading.trading_accounts
ALTER TABLE trading.orders
DROP CONSTRAINT IF EXISTS fk_orders_account;

ALTER TABLE trading.orders
ADD CONSTRAINT fk_orders_account
    FOREIGN KEY (trading_account_id)
    REFERENCES trading.trading_accounts(trading_account_id);

-- Update orders FK to reference trading.instruments
ALTER TABLE trading.orders
DROP CONSTRAINT IF EXISTS fk_orders_instrument;

ALTER TABLE trading.orders
ADD CONSTRAINT fk_orders_instrument
    FOREIGN KEY (instrument_id)
    REFERENCES trading.instruments(instrument_id);

-- ============================================================
-- UPDATE SEARCH PATHS (Optional)
-- ============================================================
-- Applications should explicitly specify schema.table in queries
-- But if needed, set search_path to include both schemas:
-- ALTER DATABASE trading_system SET search_path TO auth, trading, public;

COMMIT;
