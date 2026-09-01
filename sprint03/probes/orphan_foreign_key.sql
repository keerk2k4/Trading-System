BEGIN;

-- ============================================================
-- 1. TEST USER
-- ============================================================

INSERT INTO users (
    user_id,
    full_name,
    email,
    phone
)
OVERRIDING SYSTEM VALUE
VALUES (
    -900000000003,
    'Harness Orphan Test User',
    'harness-orphan@example.com',
    '-900000000003'
);


-- ============================================================
-- 2. TEST INSTRUMENT
-- ============================================================

INSERT INTO instruments (
    instrument_id,
    symbol,
    company_name,
    exchange,
    isin,
    instrument_type,
    status
)
OVERRIDING SYSTEM VALUE
VALUES (
    -900000000003,
    'HARNORPH',
    'Harness Orphan Test Instrument',
    'NSE',
    'IN00000000002',
    'EQUITY',
    'ACTIVE'
);


-- ============================================================
-- 3. ORDER WITH NON-EXISTENT TRADING ACCOUNT
-- ============================================================

INSERT INTO orders (
    order_id,
    trading_account_id,
    instrument_id,
    order_type,
    side,
    product_type,
    quantity,
    limit_price,
    stop_price,
    status,
    idempotency_key
)
OVERRIDING SYSTEM VALUE
VALUES (
    -900000000003,
    999999999999,
    -900000000003,
    'LIMIT',
    'BUY',
    'DELIVERY',
    10,
    100.0000,
    NULL,
    'NEW',
    'HARNESS-ORPHAN-FOREIGN-KEY'
);


ROLLBACK;