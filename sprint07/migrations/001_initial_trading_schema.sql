-- migrations/001_initial_trading_schema.sql
-- Initial database schema for the Trading System.

BEGIN;

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
    user_id BIGINT PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phonenumber VARCHAR(30) UNIQUE
);


-- ============================================================
-- ACCOUNTS
-- ============================================================
-- Account states:
-- ACTIVE    = normal account
-- SUSPENDED = temporarily suspended and can become ACTIVE again
-- CLOSED    = permanently closed and never deleted
--
-- version is used for optimistic locking.
-- ============================================================

CREATE TABLE accounts (
    account_id BIGINT PRIMARY KEY,
    account_num VARCHAR(50) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL UNIQUE,

    balance NUMERIC(18,2) NOT NULL DEFAULT 0,

    status VARCHAR(20) NOT NULL,

    version BIGINT NOT NULL DEFAULT 0,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_accounts_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id),

    CONSTRAINT chk_account_status
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),

    CONSTRAINT chk_account_balance
        CHECK (balance >= 0),

    CONSTRAINT chk_account_version
        CHECK (version >= 0)
);


-- ============================================================
-- INSTRUMENTS
-- ============================================================
-- Instruments are retained even when trading stops.
--
-- ACTIVE   = currently tradable
-- HALTED   = temporarily stopped
-- DELISTED = permanently no longer tradable but retained
-- ============================================================

CREATE TABLE instruments (
    instrument_id BIGINT PRIMARY KEY,

    ticker_symbol VARCHAR(20) NOT NULL UNIQUE,

    name VARCHAR(150) NOT NULL,

    description TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    availability BOOLEAN NOT NULL DEFAULT TRUE,

    price NUMERIC(18,4) NOT NULL,

    CONSTRAINT chk_instrument_status
        CHECK (status IN ('ACTIVE', 'HALTED', 'DELISTED')),

    CONSTRAINT chk_instrument_price
        CHECK (price >= 0)
);


-- ============================================================
-- ORDERS
-- ============================================================
-- The order is recorded when received.
--
-- Initial status:
--     PENDING
--
-- Terminal statuses:
--     FILLED
--     CANCELLED
--     REJECTED
--     EXPIRED
--
-- There is NO PARTIALLY_FILLED status.
--
-- idempotency_key is UNIQUE so the database prevents
-- duplicate orders from concurrent requests.
-- ============================================================

CREATE TABLE orders (
    order_id BIGINT PRIMARY KEY,

    idempotency_key VARCHAR(100) NOT NULL UNIQUE,

    account_id BIGINT NOT NULL,

    instrument_id BIGINT NOT NULL,

    action VARCHAR(10) NOT NULL,

    type VARCHAR(20) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    price NUMERIC(18,4) NOT NULL,

    quantity NUMERIC(18,4) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_orders_account
        FOREIGN KEY (account_id)
        REFERENCES accounts(account_id),

    CONSTRAINT fk_orders_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES instruments(instrument_id),

    CONSTRAINT chk_order_action
        CHECK (action IN ('BUY', 'SELL')),

    CONSTRAINT chk_order_type
        CHECK (type IN ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT')),

    CONSTRAINT chk_order_status
        CHECK (
            status IN (
                'PENDING',
                'FILLED',
                'CANCELLED',
                'REJECTED',
                'EXPIRED'
            )
        ),

    CONSTRAINT chk_order_price
        CHECK (price > 0),

    CONSTRAINT chk_order_quantity
        CHECK (quantity > 0)
);


-- ============================================================
-- ORDER HISTORY
-- ============================================================
-- Stores every status transition for an order.
--
-- Example:
--
-- order 1:
--     PENDING
--     FILLED
--
-- An order can have only ONE terminal status.
--
-- No PARTIALLY_FILLED status exists.
-- ============================================================

CREATE TABLE order_history (
    order_history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    order_id BIGINT NOT NULL,

    status VARCHAR(20) NOT NULL,

    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_order_history_order
        FOREIGN KEY (order_id)
        REFERENCES orders(order_id),

    CONSTRAINT chk_order_history_status
        CHECK (
            status IN (
                'PENDING',
                'FILLED',
                'CANCELLED',
                'REJECTED',
                'EXPIRED'
            )
        )
);


-- ============================================================
-- POSITIONS
-- ============================================================

CREATE TABLE positions (
    position_id BIGINT PRIMARY KEY,

    account_id BIGINT NOT NULL,

    instrument_id BIGINT NOT NULL,

    status VARCHAR(20) NOT NULL,

    total_quantity NUMERIC(18,4) NOT NULL,

    total_price NUMERIC(18,4) NOT NULL,

    as_of_date DATE NOT NULL,

    average_price NUMERIC(18,4) NOT NULL,

    trade_type VARCHAR(20) NOT NULL,

    CONSTRAINT fk_positions_account
        FOREIGN KEY (account_id)
        REFERENCES accounts(account_id),

    CONSTRAINT fk_positions_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES instruments(instrument_id),

    CONSTRAINT chk_position_quantity
        CHECK (total_quantity >= 0),

    CONSTRAINT chk_position_price
        CHECK (total_price >= 0),

    CONSTRAINT chk_position_average_price
        CHECK (average_price >= 0),

    CONSTRAINT chk_position_trade_type
        CHECK (trade_type IN ('LONG', 'SHORT'))
);


-- ============================================================
-- HOLDINGS
-- ============================================================

CREATE TABLE holdings (
    holding_id BIGINT PRIMARY KEY,

    account_id BIGINT NOT NULL,

    instrument_id BIGINT NOT NULL,

    total_quantity NUMERIC(18,4) NOT NULL,

    total_price NUMERIC(18,4) NOT NULL,

    as_of_date DATE NOT NULL,

    average_price NUMERIC(18,4) NOT NULL,

    CONSTRAINT fk_holdings_account
        FOREIGN KEY (account_id)
        REFERENCES accounts(account_id),

    CONSTRAINT fk_holdings_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES instruments(instrument_id),

    CONSTRAINT chk_holding_quantity
        CHECK (total_quantity >= 0),

    CONSTRAINT chk_holding_price
        CHECK (total_price >= 0),

    CONSTRAINT chk_holding_average_price
        CHECK (average_price >= 0)
);


-- ============================================================
-- WATCHLIST
-- ============================================================

CREATE TABLE watchlist (
    watchlist_id BIGINT PRIMARY KEY,

    user_id BIGINT NOT NULL,

    watchlist_name VARCHAR(100) NOT NULL,

    description TEXT,

    created_ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_watchlist_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
);


-- ============================================================
-- WATCHLIST INSTRUMENTS
-- ============================================================

CREATE TABLE watchlist_inst (
    wlist_id BIGINT NOT NULL,

    inst_id BIGINT NOT NULL,

    PRIMARY KEY (wlist_id, inst_id),

    CONSTRAINT fk_watchlist_inst_watchlist
        FOREIGN KEY (wlist_id)
        REFERENCES watchlist(watchlist_id),

    CONSTRAINT fk_watchlist_inst_instrument
        FOREIGN KEY (inst_id)
        REFERENCES instruments(instrument_id)
);


COMMIT;
