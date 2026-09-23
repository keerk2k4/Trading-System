-- seed/001_initial_trading_data.sql
-- Initial seed data for the Trading System.
-- NOTE: Users are populated by 001_auth_test_users.sql

BEGIN;

-- ============================================================
-- ACCOUNTS
-- ============================================================

INSERT INTO trading.trading_accounts (
    trading_account_id,
    account_number,
    user_id,
    available_balance,
    account_status,
    version,
    created_at
) VALUES
(
    1,
    'ACC-100001',
    '550e8400-e29b-41d4-a716-446655440001',
    25000.00,
    'ACTIVE',
    0,
    '2026-08-01 09:00:00'
),
(
    2,
    'ACC-100002',
    '550e8400-e29b-41d4-a716-446655440002',
    50000.00,
    'ACTIVE',
    0,
    '2026-08-02 09:30:00'
),
(
    3,
    'ACC-100003',
    '550e8400-e29b-41d4-a716-446655440003',
    15000.00,
    'ACTIVE',
    0,
    '2026-08-03 10:00:00'
),
(
    4,
    'ACC-100004',
    '550e8400-e29b-41d4-a716-446655440004',
    75000.00,
    'ACTIVE',
    0,
    '2026-08-04 10:30:00'
),
(
    5,
    'ACC-100005',
    '550e8400-e29b-41d4-a716-446655440005',
    30000.00,
    'ACTIVE',
    0,
    '2026-08-05 11:00:00'
);


-- ============================================================
-- INSTRUMENTS
-- ============================================================

INSERT INTO trading.instruments (
    instrument_id,
    symbol,
    display_name,
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

INSERT INTO trading.orders (
    order_id,
    idempotency_key,
    trading_account_id,
    instrument_id,
    side,
    order_type,
    status,
    limit_price,
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
    'NEW',
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
    'NEW',
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

INSERT INTO trading.order_history (
    order_id,
    status,
    timestamp
) VALUES
(
    1,
    'NEW',
    '2026-08-10 10:15:00'
),
(
    1,
    'FILLED',
    '2026-08-10 10:16:30'
),
(
    2,
    'NEW',
    '2026-08-10 11:20:00'
),
(
    2,
    'FILLED',
    '2026-08-10 11:20:05'
),
(
    3,
    'NEW',
    '2026-08-11 09:45:00'
),
(
    4,
    'NEW',
    '2026-08-11 13:10:00'
),
(
    4,
    'CANCELLED',
    '2026-08-11 14:05:00'
),
(
    5,
    'NEW',
    '2026-08-12 10:30:00'
),
(
    5,
    'FILLED',
    '2026-08-12 10:30:08'
),
(
    6,
    'NEW',
    '2026-08-12 14:00:00'
),
(
    6,
    'REJECTED',
    '2026-08-12 14:00:02'
),
(
    7,
    'NEW',
    '2026-08-13 09:20:00'
),
(
    7,
    'FILLED',
    '2026-08-13 09:21:15'
),
(
    8,
    'NEW',
    '2026-08-13 12:15:00'
),
(
    8,
    'FILLED',
    '2026-08-13 12:15:05'
),
(
    9,
    'NEW',
    '2026-08-14 10:05:00'
),
(
    10,
    'NEW',
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

INSERT INTO trading.positions (
    position_id,
    trading_account_id,
    instrument_id,
    position_status,
    quantity,
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
    '2026-08-20',
    233.8800,
    'LONG'
);


-- ============================================================
-- HOLDINGS
-- ============================================================

INSERT INTO trading.holdings (
    holding_id,
    demat_account_id,
    instrument_id,
    quantity,
    created_at_date,
    average_price
) VALUES
(
    1,
    1,
    1,
    10.0000,
    '2026-08-20',
    224.1200
),
(
    2,
    1,
    2,
    5.0000,
    '2026-08-20',
    509.7700
),
(
    3,
    2,
    3,
    10.0000,
    '2026-08-20',
    202.9100
),
(
    4,
    3,
    6,
    15.0000,
    '2026-08-20',
    180.3000
),
(
    5,
    4,
    7,
    6.0000,
    '2026-08-20',
    775.8800
),
(
    6,
    4,
    8,
    2.0000,
    '2026-08-20',
    1210.4500
),
(
    7,
    5,
    4,
    12.0000,
    '2026-08-20',
    233.8800
);


-- ============================================================
-- WATCHLISTS
-- ============================================================

INSERT INTO trading.watchlist (
    watchlist_id,
    user_id,
    watchlist_name,
    description,
    created_ts,
    updated_ts
) VALUES
(
    1,
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    'Tech Giants',
    'Large technology companies',
    '2026-08-01 09:15:00',
    '2026-08-18 12:00:00'
),
(
    2,
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    'Growth Stocks',
    'High-growth stocks to monitor',
    '2026-08-05 10:00:00',
    '2026-08-19 09:30:00'
),
(
    3,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    'US Tech',
    'US technology stocks',
    '2026-08-02 10:00:00',
    '2026-08-17 14:20:00'
),
(
    4,
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    'AI Stocks',
    'Artificial intelligence related stocks',
    '2026-08-03 11:00:00',
    '2026-08-16 15:45:00'
),
(
    5,
    '550e8400-e29b-41d4-a716-446655440004'::uuid,
    'Long Term',
    'Long-term investment candidates',
    '2026-08-04 11:30:00',
    '2026-08-18 16:10:00'
),
(
    6,
    '550e8400-e29b-41d4-a716-446655440005'::uuid,
    'Market Watch',
    'General market watchlist',
    '2026-08-05 12:00:00',
    '2026-08-19 10:15:00'
);


-- ============================================================
-- WATCHLIST INSTRUMENTS
-- ============================================================

INSERT INTO trading.watchlist_inst (
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
