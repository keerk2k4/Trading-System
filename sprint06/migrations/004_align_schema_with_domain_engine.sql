-- migrations/004_align_schema_with_domain_engine.sql
-- Reshapes the existing tables so their columns and status literals match
-- what the Sprint 5 domain-engine entities and Sprint 6 mappers expect.
-- Nothing in 001/002/003 is edited -- this is purely additive/renaming.

BEGIN;

-- ============================================================
-- USERS
-- ============================================================
-- Sprint 5's User entity needs firstName/lastName separately, a
-- passwordHash field, a phone field, and a status. The real table only
-- had one combined user_name and no status at all.

ALTER TABLE users RENAME COLUMN password TO password_hash;
ALTER TABLE users RENAME COLUMN phonenumber TO phone;

ALTER TABLE users ADD COLUMN first_name VARCHAR(100) NOT NULL DEFAULT 'Unknown';
ALTER TABLE users ADD COLUMN last_name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE users ALTER COLUMN first_name DROP DEFAULT;
ALTER TABLE users ALTER COLUMN last_name DROP DEFAULT;
-- Note: seed data must provide first_name/last_name explicitly for any
-- NEW rows -- this migration only adds the columns, it cannot retroactively
-- know a real first/last name split for data that doesn't exist yet.

ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE users ADD CONSTRAINT chk_user_status
    CHECK (status IN ('ACTIVE', 'BLOCKED', 'DEACTIVATED'));

-- user_name is left in place, unused going forward, rather than dropped,
-- so nothing that already reads it breaks.


-- ============================================================
-- ACCOUNTS -> renamed to trading_accounts
-- ============================================================
-- Sprint 6's mappers were written against a table called
-- trading_accounts, with the balance split into available/blocked,
-- and account_number/account_status as the column names.

ALTER TABLE accounts RENAME TO trading_accounts;
ALTER TABLE trading_accounts RENAME COLUMN account_id TO trading_account_id;
ALTER TABLE trading_accounts RENAME COLUMN account_num TO account_number;
ALTER TABLE trading_accounts RENAME COLUMN balance TO available_balance;
ALTER TABLE trading_accounts RENAME COLUMN status TO account_status;

ALTER TABLE trading_accounts ADD COLUMN blocked_balance NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE trading_accounts ADD CONSTRAINT chk_trading_account_blocked_balance
    CHECK (blocked_balance >= 0);

ALTER TABLE trading_accounts ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- version already existed on the original accounts table -- nothing to add there.


-- ============================================================
-- INSTRUMENTS
-- ============================================================
-- Sprint 5's Instrument entity has symbol/displayName/assetClass/
-- quotationCurrency and a simple delisted flag, rather than the real
-- table's ticker_symbol/name/status/availability.

ALTER TABLE instruments RENAME COLUMN ticker_symbol TO symbol;
ALTER TABLE instruments RENAME COLUMN name TO display_name;

ALTER TABLE instruments ADD COLUMN asset_class VARCHAR(20) NOT NULL DEFAULT 'EQUITY';
ALTER TABLE instruments ADD CONSTRAINT chk_instrument_asset_class
    CHECK (asset_class IN ('EQUITY', 'ETF', 'BOND'));

ALTER TABLE instruments ADD COLUMN quotation_currency VARCHAR(3) NOT NULL DEFAULT 'INR';


-- ============================================================
-- ORDERS
-- ============================================================
-- Team decision: rename PENDING -> NEW everywhere, since Sprint 5's
-- OrderStatus enum expects every order to start life as NEW.

ALTER TABLE orders RENAME COLUMN account_id TO trading_account_id;
ALTER TABLE orders RENAME COLUMN action TO side;
ALTER TABLE orders RENAME COLUMN type TO order_type;
ALTER TABLE orders RENAME COLUMN price TO limit_price;

ALTER TABLE orders ADD COLUMN stop_price NUMERIC(18,4);
ALTER TABLE orders ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Team decision: product_type (INTRADAY/DELIVERY) already exists on orders
-- as trade_type, added by 003_add_trade_type.sql -- just rename it, since
-- it's already exactly the right concept under a different name.
ALTER TABLE orders RENAME COLUMN trade_type TO product_type;

-- Rename the PENDING literal to NEW, everywhere it appears.
ALTER TABLE orders DROP CONSTRAINT chk_order_status;

UPDATE orders SET status = 'NEW' WHERE status = 'PENDING';

ALTER TABLE orders ADD CONSTRAINT chk_order_status
    CHECK (status IN ('NEW', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'));

ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'NEW';


-- ============================================================
-- ORDER_HISTORY
-- ============================================================
-- Same PENDING -> NEW rename, for consistency with orders.status.

ALTER TABLE order_history DROP CONSTRAINT chk_order_history_status;

UPDATE order_history SET status = 'NEW' WHERE status = 'PENDING';

ALTER TABLE order_history ADD CONSTRAINT chk_order_history_status
    CHECK (status IN ('NEW', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'));


-- ============================================================
-- POSITIONS
-- ============================================================
-- Sprint 5's Position entity has quantity/averagePrice/realizedPnl/
-- positionStatus(OPEN,CLOSED)/openedAt/closedAt/updatedAt, and a
-- productType(INTRADAY,DELIVERY) that is NOT the same thing as the real
-- trade_type(LONG,SHORT) column here.
-- Team decision: add product_type as a new column, leave trade_type alone.

ALTER TABLE positions RENAME COLUMN account_id TO trading_account_id;
ALTER TABLE positions RENAME COLUMN total_quantity TO quantity;
ALTER TABLE positions DROP COLUMN total_price;
ALTER TABLE positions RENAME COLUMN status TO position_status;

ALTER TABLE positions ADD COLUMN realized_pnl NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE positions ADD COLUMN opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE positions ADD COLUMN closed_at TIMESTAMP;
ALTER TABLE positions ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE positions ADD COLUMN product_type VARCHAR(20) NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE positions ADD CONSTRAINT chk_positions_product_type
    CHECK (product_type IN ('INTRADAY', 'DELIVERY'));

-- position_status now needs OPEN/CLOSED, not whatever it held before.
ALTER TABLE positions ALTER COLUMN position_status SET DEFAULT 'OPEN';


-- ============================================================
-- HOLDINGS
-- ============================================================

ALTER TABLE holdings RENAME COLUMN account_id TO demat_account_id;
ALTER TABLE holdings RENAME COLUMN total_quantity TO quantity;
ALTER TABLE holdings DROP COLUMN total_price;
ALTER TABLE holdings ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE holdings RENAME COLUMN as_of_date TO created_at_date;

COMMIT;
