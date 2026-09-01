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
    -900000000001,
    'Harness Duplicate Test User',
    'harness-duplicate@example.com',
    '-900000000001'
);


-- ============================================================
-- 2. TEST TRADING ACCOUNT
-- ============================================================

INSERT INTO trading_accounts (
    trading_account_id,
    user_id,
    available_balance,
    blocked_balance,
    account_status
)
OVERRIDING SYSTEM VALUE
VALUES (
    -900000000001,
    -900000000001,
    10000.00,
    0.00,
    'ACTIVE'
);


-- ============================================================
-- 3. TEST INSTRUMENT
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
    -900000000001,
    'HARNDUP',
    'Harness Duplicate Test Instrument',
    'NSE',
    'IN00000000001',
    'EQUITY',
    'ACTIVE'
);


-- ============================================================
-- 4. FIRST ORDER
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
    -900000000001,
    -900000000001,
    -900000000001,
    'LIMIT',
    'BUY',
    'DELIVERY',
    10,
    100.0000,
    NULL,
    'NEW',
    'HARNESS-DUPLICATE-IDEMPOTENCY-KEY'
);


-- ============================================================
-- 5. DUPLICATE IDEMPOTENCY KEY
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
    -900000000002,
    -900000000001,
    -900000000001,
    'LIMIT',
    'BUY',
    'DELIVERY',
    10,
    100.0000,
    NULL,
    'NEW',
    'HARNESS-DUPLICATE-IDEMPOTENCY-KEY'
);


ROLLBACK;