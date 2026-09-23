-- migrations/008_create_schemas_and_migrate_tables.sql
-- Organizes the database into two logical schemas:
-- - auth: Authentication and user management (users, refresh_tokens)
-- - trading: Trading-related entities (accounts, instruments, orders, trades, etc.)
--
-- This migration:
-- 1. Creates both schemas
-- 2. Moves users and refresh_tokens to auth schema
-- 3. Moves all trading tables to trading schema
-- 4. Updates foreign key constraints

BEGIN;

-- ============================================================
-- CREATE SCHEMAS
-- ============================================================

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS trading;

-- ============================================================
-- MIGRATE TABLES TO SCHEMAS
-- ============================================================

-- Users table: Move to auth schema
ALTER TABLE IF EXISTS users SET SCHEMA auth;

-- Refresh tokens table: Move to auth schema
ALTER TABLE IF EXISTS refresh_tokens SET SCHEMA auth;

-- Trading-related tables: Move to trading schema
ALTER TABLE IF EXISTS trading_accounts SET SCHEMA trading;
ALTER TABLE IF EXISTS instruments SET SCHEMA trading;
ALTER TABLE IF EXISTS orders SET SCHEMA trading;
ALTER TABLE IF EXISTS trades SET SCHEMA trading;
ALTER TABLE IF EXISTS order_items SET SCHEMA trading;

-- ============================================================
-- UPDATE FOREIGN KEY CONSTRAINTS (if needed)
-- ============================================================

-- Update accounts FK to reference auth.users
ALTER TABLE trading.accounts
DROP CONSTRAINT IF EXISTS fk_accounts_user;

ALTER TABLE trading.accounts
ADD CONSTRAINT fk_accounts_user_auth
    FOREIGN KEY (user_id)
    REFERENCES auth.users(user_id);

-- Update orders FK to reference trading.accounts
ALTER TABLE trading.orders
DROP CONSTRAINT IF EXISTS fk_orders_account;

ALTER TABLE trading.orders
ADD CONSTRAINT fk_orders_account
    FOREIGN KEY (account_id)
    REFERENCES trading.accounts(account_id);

-- Update orders FK to reference trading.instruments
ALTER TABLE trading.orders
DROP CONSTRAINT IF EXISTS fk_orders_instrument;

ALTER TABLE trading.orders
ADD CONSTRAINT fk_orders_instrument
    FOREIGN KEY (instrument_id)
    REFERENCES trading.instruments(instrument_id);

-- Update trades FK to reference trading.accounts
ALTER TABLE trading.trades
DROP CONSTRAINT IF EXISTS fk_trades_account;

ALTER TABLE trading.trades
ADD CONSTRAINT fk_trades_account
    FOREIGN KEY (account_id)
    REFERENCES trading.accounts(account_id);

-- Update trades FK to reference trading.instruments
ALTER TABLE trading.trades
DROP CONSTRAINT IF EXISTS fk_trades_instrument;

ALTER TABLE trading.trades
ADD CONSTRAINT fk_trades_instrument
    FOREIGN KEY (instrument_id)
    REFERENCES trading.instruments(instrument_id);

-- Update order_items FK to reference trading.orders
ALTER TABLE trading.order_items
DROP CONSTRAINT IF EXISTS fk_order_items_order;

ALTER TABLE trading.order_items
ADD CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id)
    REFERENCES trading.orders(order_id);

-- ============================================================
-- UPDATE SEARCH PATHS (Optional)
-- ============================================================
-- Applications should explicitly specify schema.table in queries
-- But if needed, set search_path to include both schemas:
-- ALTER DATABASE trading_system SET search_path TO auth, trading, public;

COMMIT;
