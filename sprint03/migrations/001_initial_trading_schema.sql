
BEGIN;
-- ============================================
-- 1. USERS
-- ============================================

CREATE TABLE users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_user_status
        CHECK (status IN ('ACTIVE', 'BLOCKED', 'DEACTIVATED'))
);


-- ============================================
-- 2. TRADING ACCOUNT
-- ============================================

CREATE TABLE trading_accounts (
    trading_account_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,

    account_number VARCHAR(30) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    available_balance NUMERIC(19, 4) NOT NULL DEFAULT 0,
    blocked_balance NUMERIC(19, 4) NOT NULL DEFAULT 0,
    account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_trading_account_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id),

    CONSTRAINT chk_available_balance
        CHECK (available_balance >= 0),

    CONSTRAINT chk_blocked_balance
        CHECK (blocked_balance >= 0),

    CONSTRAINT chk_trading_account_status
        CHECK (account_status IN ('ACTIVE', 'BLOCKED', 'CLOSED'))
);


-- ============================================
-- 3. DEMAT ACCOUNT
-- ============================================

CREATE TABLE demat_accounts (
    demat_account_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,

    account_number VARCHAR(30) NOT NULL UNIQUE,

    account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_demat_account_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id),

    CONSTRAINT chk_demat_account_status
        CHECK (account_status IN ('ACTIVE', 'BLOCKED', 'CLOSED'))
);


-- ============================================
-- 4. INSTRUMENT

-- ============================================

CREATE TABLE instruments (
    instrument_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    symbol VARCHAR(30) NOT NULL,
    company_name VARCHAR(200) NOT NULL,

    exchange VARCHAR(10) NOT NULL,
    isin VARCHAR(20) UNIQUE,
    company_name VARCHAR(200) NOT NULL,

    instrument_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_instrument_exchange_symbol
        UNIQUE (exchange, symbol),

    CONSTRAINT chk_instrument_exchange
        CHECK (exchange IN ('NSE', 'BSE')),

    CONSTRAINT chk_instrument_type
        CHECK (instrument_type IN (
            'EQUITY',
            'ETF',
            'BOND'
        )),

    CONSTRAINT chk_instrument_status
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELISTED'))
);


-- ============================================
-- 5. ORDERS
-- ============================================

CREATE TABLE orders (
    order_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    trading_account_id BIGINT NOT NULL,
    instrument_id BIGINT NOT NULL,

    order_type VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    product_type VARCHAR(20) NOT NULL,

    quantity INTEGER NOT NULL,

    limit_price NUMERIC(19, 4),
    stop_price NUMERIC(19, 4),

    status VARCHAR(30) NOT NULL DEFAULT 'NEW',

    idempotency_key VARCHAR(100) NOT NULL UNIQUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_order_trading_account
        FOREIGN KEY (trading_account_id)
        REFERENCES trading_accounts(trading_account_id),

    CONSTRAINT fk_order_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES instruments(instrument_id),

    CONSTRAINT chk_order_quantity
        CHECK (quantity > 0),

    CONSTRAINT chk_order_side
        CHECK (side IN ('BUY', 'SELL')),

    CONSTRAINT chk_order_product_type
        CHECK (product_type IN ('INTRADAY', 'DELIVERY')),

    CONSTRAINT chk_order_type
        CHECK (order_type IN (
            'MARKET',
            'LIMIT',
            'STOP_LOSS',
            'STOP_LIMIT'
        )),

    CONSTRAINT chk_order_status
        CHECK (status IN (
            'NEW',
            'OPEN',
            'PARTIALLY_FILLED',
            'FILLED',
            'CANCELLED',
            'REJECTED',
            'EXPIRED'
        )),

    CONSTRAINT chk_order_prices
        CHECK (
            (order_type = 'MARKET'
                AND limit_price IS NULL
                AND stop_price IS NULL)

            OR

            (order_type = 'LIMIT'
                AND limit_price IS NOT NULL
                AND limit_price > 0
                AND stop_price IS NULL)

            OR

            (order_type = 'STOP_LOSS'
                AND stop_price IS NOT NULL
                AND stop_price > 0
                AND limit_price IS NULL)

            OR

            (order_type = 'STOP_LIMIT'
                AND limit_price IS NOT NULL
                AND limit_price > 0
                AND stop_price IS NOT NULL
                AND stop_price > 0)
        )
);


-- ============================================
-- 6. ORDER HISTORY
-- ============================================

CREATE TABLE order_history (
    history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    order_id BIGINT NOT NULL,

    event_type VARCHAR(40) NOT NULL,

    old_status VARCHAR(30),
    new_status VARCHAR(30),

    event_data JSONB,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_order_history_order
        FOREIGN KEY (order_id)
        REFERENCES orders(order_id),

    CONSTRAINT chk_order_history_event
        CHECK (event_type IN (
            'ORDER_CREATED',
            'ORDER_SUBMITTED',
            'ORDER_ACCEPTED',
            'ORDER_REJECTED',
            'ORDER_PARTIALLY_FILLED',
            'ORDER_FILLED',
            'ORDER_CANCEL_REQUESTED',
            'ORDER_CANCELLED',
            'ORDER_EXPIRED'
        ))
);


-- ============================================
-- 7. EXECUTION
-- ============================================

CREATE TABLE executions (
    execution_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    order_id BIGINT NOT NULL,

    execution_reference VARCHAR(100) UNIQUE,

    execution_quantity INTEGER NOT NULL,
    execution_price NUMERIC(19, 4) NOT NULL,

    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_execution_order
        FOREIGN KEY (order_id)
        REFERENCES orders(order_id),

    CONSTRAINT chk_execution_quantity
        CHECK (execution_quantity > 0),

    CONSTRAINT chk_execution_price
        CHECK (execution_price > 0)
);


-- ============================================
-- 8. POSITIONS
-- ============================================

CREATE TABLE positions (
    position_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    trading_account_id BIGINT NOT NULL,
    instrument_id BIGINT NOT NULL,

    product_type VARCHAR(20) NOT NULL,

    quantity INTEGER NOT NULL,
    average_price NUMERIC(19, 4) NOT NULL,

    realized_pnl NUMERIC(19, 4) NOT NULL DEFAULT 0,

    position_status VARCHAR(20) NOT NULL DEFAULT 'OPEN',

    opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_position_trading_account
        FOREIGN KEY (trading_account_id)
        REFERENCES trading_accounts(trading_account_id),

    CONSTRAINT fk_position_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES instruments(instrument_id),

    CONSTRAINT chk_position_product_type
        CHECK (product_type IN ('INTRADAY', 'DELIVERY')),

    CONSTRAINT chk_position_quantity
        CHECK (quantity >= 0),

    CONSTRAINT chk_position_average_price
        CHECK (average_price > 0),

    CONSTRAINT chk_position_status
        CHECK (position_status IN ('OPEN', 'CLOSED')),

    CONSTRAINT chk_position_closed_at
        CHECK (
            (position_status = 'OPEN' AND closed_at IS NULL)
            OR
            (position_status = 'CLOSED' AND closed_at IS NOT NULL)
        )

        
);


-- ============================================
-- 9. SETTLEMENT
-- ============================================

CREATE TABLE settlements (
    settlement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    execution_id BIGINT NOT NULL,
    demat_account_id BIGINT NOT NULL,

    quantity INTEGER NOT NULL,

    settlement_date DATE NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_settlement_execution
        FOREIGN KEY (execution_id)
        REFERENCES executions(execution_id),

    CONSTRAINT fk_settlement_demat
        FOREIGN KEY (demat_account_id)
        REFERENCES demat_accounts(demat_account_id),

    CONSTRAINT chk_settlement_quantity
        CHECK (quantity > 0),

    CONSTRAINT chk_settlement_status
        CHECK (status IN (
            'PENDING',
            'PROCESSING',
            'SETTLED',
            'FAILED'
        )),

    CONSTRAINT uq_settlement_execution
        UNIQUE (execution_id)
);


-- ============================================
-- 10. HOLDINGS
-- ============================================

CREATE TABLE holdings (
    holding_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    demat_account_id BIGINT NOT NULL,
    instrument_id BIGINT NOT NULL,

    quantity INTEGER NOT NULL,
    average_price NUMERIC(19, 4) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_holding_demat
        FOREIGN KEY (demat_account_id)
        REFERENCES demat_accounts(demat_account_id),

    CONSTRAINT fk_holding_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES instruments(instrument_id),

    CONSTRAINT chk_holding_quantity
        CHECK (quantity >= 0),

    CONSTRAINT chk_holding_average_price
        CHECK (average_price > 0),

    CONSTRAINT uq_holding_demat_instrument
        UNIQUE (demat_account_id, instrument_id)
);


-- ============================================
-- 11. ACCOUNT TRANSACTIONS
-- ============================================

CREATE TABLE account_transactions (
    transaction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    trading_account_id BIGINT NOT NULL,

    transaction_type VARCHAR(30) NOT NULL,
    amount NUMERIC(19, 4) NOT NULL,
    direction VARCHAR(10) NOT NULL,

    reference_type VARCHAR(30),
    reference_id BIGINT,

    description VARCHAR(500),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_account_transaction_account
        FOREIGN KEY (trading_account_id)
        REFERENCES trading_accounts(trading_account_id),

    CONSTRAINT chk_transaction_amount
        CHECK (amount > 0),

    CONSTRAINT chk_transaction_direction
        CHECK (direction IN ('CREDIT', 'DEBIT')),

    CONSTRAINT chk_transaction_type
        CHECK (transaction_type IN (
            'DEPOSIT',
            'WITHDRAWAL',
            'BUY',
            'SELL',
            'BROKERAGE',
            'TAX',
            'FEE',
            'ADJUSTMENT'
        ))
);

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