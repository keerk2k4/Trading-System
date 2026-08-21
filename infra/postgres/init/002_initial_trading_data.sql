-- seed/001_initial_trading_data.sql
-- Initial seed data for the Trading System.

BEGIN;

-- ============================================================
-- USERS
-- ============================================================

INSERT INTO users (
    user_id,
    user_name,
    password,
    email,
    phonenumber
) VALUES
(
    1,
    'alice_trader',
    '$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H1',
    'alice@example.com',
    '+353871000001'
),
(
    2,
    'bob_investor',
    '$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H2',
    'bob@example.com',
    '+353871000002'
),
(
    3,
    'charlie_trader',
    '$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H3',
    'charlie@example.com',
    '+353871000003'
),
(
    4,
    'diana_investor',
    '$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H4',
    'diana@example.com',
    '+353871000004'
),
(
    5,
    'ethan_trader',
    '$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H5',
    'ethan@example.com',
    '+353871000005'
);


-- ============================================================
-- ACCOUNTS
-- ============================================================

INSERT INTO accounts (
    account_id,
    account_num,
    user_id,
    balance,
    status,
    version,
    created_at
) VALUES
(
    1,
    'ACC-100001',
    1,
    25000.00,
    'ACTIVE',
    0,
    '2026-08-01 09:00:00'
),
(
    2,
    'ACC-100002',
    2,
    50000.00,
    'ACTIVE',
    0,
    '2026-08-02 09:30:00'
),
(
    3,
    'ACC-100003',
    3,
    15000.00,
    'ACTIVE',
    0,
    '2026-08-03 10:00:00'
),
(
    4,
    'ACC-100004',
    4,
    75000.00,
    'ACTIVE',
    0,
    '2026-08-04 10:30:00'
),
(
    5,
    'ACC-100005',
    5,
    30000.00,
    'ACTIVE',
    0,
    '2026-08-05 11:00:00'
);


-- ============================================================
-- INSTRUMENTS
-- ============================================================

INSERT INTO instruments (
    instrument_id,
    ticker_symbol,
    name,
    description,
    status,
    availability,
    price
) VALUES
(
    1,
    'AAPL',
    'Apple Inc.',
    'Apple common stock',
    'ACTIVE',
    TRUE,
    224.1200
),
(
    2,
    'MSFT',
    'Microsoft Corporation',
    'Microsoft common stock',
    'ACTIVE',
    TRUE,
    509.7700
),
(
    3,
    'GOOGL',
    'Alphabet Inc.',
    'Alphabet Class A common stock',
    'ACTIVE',
    TRUE,
    202.9100
),
(
    4,
    'AMZN',
    'Amazon.com Inc.',
    'Amazon common stock',
    'ACTIVE',
    TRUE,
    233.8800
),
(
    5,
    'TSLA',
    'Tesla Inc.',
    'Tesla common stock',
    'ACTIVE',
    TRUE,
    331.1200
),
(
    6,
    'NVDA',
    'NVIDIA Corporation',
    'NVIDIA common stock',
    'ACTIVE',
    TRUE,
    180.3000
),
(
    7,
    'META',
    'Meta Platforms Inc.',
    'Meta common stock',
    'ACTIVE',
    TRUE,
    775.8800
),
(
    8,
    'NFLX',
    'Netflix Inc.',
    'Netflix common stock',
    'ACTIVE',
    TRUE,
    1210.4500
);


-- ============================================================
-- ORDERS
-- ============================================================
-- Each order has a unique idempotency_key.
--
-- Order 3 is PENDING rather than PARTIALLY_FILLED because
-- the new schema deliberately does not support partial fills.
-- ============================================================

INSERT INTO orders (
    order_id,
    idempotency_key,
    account_id,
    instrument_id,
    action,
    type,
    status,
    price,
    quantity,
    created_at
) VALUES
(
    1,
    'IDEMP-ORDER-000001',
    1,
    1,
    'BUY',
    'LIMIT',
    'FILLED',
    220.0000,
    10.0000,
    '2026-08-10 10:15:00'
),
(
    2,
    'IDEMP-ORDER-000002',
    1,
    2,
    'BUY',
    'MARKET',
    'FILLED',
    509.7700,
    5.0000,
    '2026-08-10 11:20:00'
),
(
    3,
    'IDEMP-ORDER-000003',
    2,
    3,
    'BUY',
    'LIMIT',
    'PENDING',
    200.0000,
    20.0000,
    '2026-08-11 09:45:00'
),
(
    4,
    'IDEMP-ORDER-000004',
    2,
    5,
    'SELL',
    'LIMIT',
    'CANCELLED',
    330.0000,
    8.0000,
    '2026-08-11 13:10:00'
),
(
    5,
    'IDEMP-ORDER-000005',
    3,
    6,
    'BUY',
    'MARKET',
    'FILLED',
    180.3000,
    15.0000,
    '2026-08-12 10:30:00'
),
(
    6,
    'IDEMP-ORDER-000006',
    3,
    1,
    'SELL',
    'LIMIT',
    'REJECTED',
    225.0000,
    5.0000,
    '2026-08-12 14:00:00'
),
(
    7,
    'IDEMP-ORDER-000007',
    4,
    7,
    'BUY',
    'LIMIT',
    'FILLED',
    770.0000,
    6.0000,
    '2026-08-13 09:20:00'
),
(
    8,
    'IDEMP-ORDER-000008',
    4,
    8,
    'BUY',
    'MARKET',
    'FILLED',
    1210.4500,
    2.0000,
    '2026-08-13 12:15:00'
),
(
    9,
    'IDEMP-ORDER-000009',
    5,
    4,
    'BUY',
    'LIMIT',
    'PENDING',
    230.0000,
    12.0000,
    '2026-08-14 10:05:00'
),
(
    10,
    'IDEMP-ORDER-000010',
    5,
    2,
    'SELL',
    'STOP',
    'EXPIRED',
    500.0000,
    3.0000,
    '2026-08-14 15:30:00'
);


-- ============================================================
-- ORDER HISTORY
-- ============================================================
-- The history records every status transition.
--
-- No PARTIALLY_FILLED status is used.
-- ============================================================

INSERT INTO order_history (
    order_id,
    status,
    timestamp
) VALUES
(
    1,
    'PENDING',
    '2026-08-10 10:15:00'
),
(
    1,
    'FILLED',
    '2026-08-10 10:16:30'
),
(
    2,
    'PENDING',
    '2026-08-10 11:20:00'
),
(
    2,
    'FILLED',
    '2026-08-10 11:20:05'
),
(
    3,
    'PENDING',
    '2026-08-11 09:45:00'
),
(
    4,
    'PENDING',
    '2026-08-11 13:10:00'
),
(
    4,
    'CANCELLED',
    '2026-08-11 14:05:00'
),
(
    5,
    'PENDING',
    '2026-08-12 10:30:00'
),
(
    5,
    'FILLED',
    '2026-08-12 10:30:08'
),
(
    6,
    'PENDING',
    '2026-08-12 14:00:00'
),
(
    6,
    'REJECTED',
    '2026-08-12 14:00:02'
),
(
    7,
    'PENDING',
    '2026-08-13 09:20:00'
),
(
    7,
    'FILLED',
    '2026-08-13 09:21:15'
),
(
    8,
    'PENDING',
    '2026-08-13 12:15:00'
),
(
    8,
    'FILLED',
    '2026-08-13 12:15:05'
),
(
    9,
    'PENDING',
    '2026-08-14 10:05:00'
),
(
    10,
    'PENDING',
    '2026-08-14 15:30:00'
),
(
    10,
    'EXPIRED',
    '2026-08-15 16:00:00'
);


-- ============================================================
-- POSITIONS
-- ============================================================

INSERT INTO positions (
    position_id,
    account_id,
    instrument_id,
    status,
    total_quantity,
    total_price,
    as_of_date,
    average_price,
    trade_type
) VALUES
(
    1,
    1,
    1,
    'OPEN',
    10.0000,
    2241.2000,
    '2026-08-20',
    224.1200,
    'LONG'
),
(
    2,
    1,
    2,
    'OPEN',
    5.0000,
    2548.8500,
    '2026-08-20',
    509.7700,
    'LONG'
),
(
    3,
    2,
    3,
    'OPEN',
    10.0000,
    2029.1000,
    '2026-08-20',
    202.9100,
    'LONG'
),
(
    4,
    3,
    6,
    'OPEN',
    15.0000,
    2704.5000,
    '2026-08-20',
    180.3000,
    'LONG'
),
(
    5,
    4,
    7,
    'OPEN',
    6.0000,
    4655.2800,
    '2026-08-20',
    775.8800,
    'LONG'
),
(
    6,
    4,
    8,
    'OPEN',
    2.0000,
    2420.9000,
    '2026-08-20',
    1210.4500,
    'LONG'
),
(
    7,
    5,
    4,
    'OPEN',
    12.0000,
    2806.5600,
    '2026-08-20',
    233.8800,
    'LONG'
);


-- ============================================================
-- HOLDINGS
-- ============================================================

INSERT INTO holdings (
    holding_id,
    account_id,
    instrument_id,
    total_quantity,
    total_price,
    as_of_date,
    average_price
) VALUES
(
    1,
    1,
    1,
    10.0000,
    2241.2000,
    '2026-08-20',
    224.1200
),
(
    2,
    1,
    2,
    5.0000,
    2548.8500,
    '2026-08-20',
    509.7700
),
(
    3,
    2,
    3,
    10.0000,
    2029.1000,
    '2026-08-20',
    202.9100
),
(
    4,
    3,
    6,
    15.0000,
    2704.5000,
    '2026-08-20',
    180.3000
),
(
    5,
    4,
    7,
    6.0000,
    4655.2800,
    '2026-08-20',
    775.8800
),
(
    6,
    4,
    8,
    2.0000,
    2420.9000,
    '2026-08-20',
    1210.4500
),
(
    7,
    5,
    4,
    12.0000,
    2806.5600,
    '2026-08-20',
    233.8800
);


-- ============================================================
-- WATCHLISTS
-- ============================================================

INSERT INTO watchlist (
    watchlist_id,
    user_id,
    watchlist_name,
    description,
    created_ts,
    updated_ts
) VALUES
(
    1,
    1,
    'Tech Giants',
    'Large technology companies',
    '2026-08-01 09:15:00',
    '2026-08-18 12:00:00'
),
(
    2,
    1,
    'Growth Stocks',
    'High-growth stocks to monitor',
    '2026-08-05 10:00:00',
    '2026-08-19 09:30:00'
),
(
    3,
    2,
    'US Tech',
    'US technology stocks',
    '2026-08-02 10:00:00',
    '2026-08-17 14:20:00'
),
(
    4,
    3,
    'AI Stocks',
    'Artificial intelligence related stocks',
    '2026-08-03 11:00:00',
    '2026-08-16 15:45:00'
),
(
    5,
    4,
    'Long Term',
    'Long-term investment candidates',
    '2026-08-04 11:30:00',
    '2026-08-18 16:10:00'
),
(
    6,
    5,
    'Market Watch',
    'General market watchlist',
    '2026-08-05 12:00:00',
    '2026-08-19 10:15:00'
);


-- ============================================================
-- WATCHLIST INSTRUMENTS
-- ============================================================

INSERT INTO watchlist_inst (
    wlist_id,
    inst_id
) VALUES
(1, 1),
(1, 2),
(1, 3),
(1, 4),

(2, 5),
(2, 6),
(2, 7),

(3, 1),
(3, 2),
(3, 8),

(4, 6),
(4, 7),
(4, 3),

(5, 2),
(5, 4),
(5, 5),

(6, 1),
(6, 3),
(6, 5),
(6, 8);


COMMIT;
