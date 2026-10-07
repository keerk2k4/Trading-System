-- seed/003_portfolio_demo_data.sql
-- A demo customer for the Portfolio and P&L module (contracts/portfolio-api.yaml).
--
-- Six months of trading in AAPL, MSFT and NVDA, every fill at that day's real
-- closing price from the saved Fauxnance candles
-- (Frontend/frontend-app/public/candles/*.json), so the portfolio page's
-- value-over-time chart passes through each trade. The trades are demo data;
-- the prices are not.
--
-- Sign in:  username  portfolio_demo
--           password  Portfolio@2026
--
-- The rows below agree with each other, by the same rules as the executor's
-- SettlementService (weighted average cost; a SELL keeps the average):
--
--   date        order            fill     qty after  avg cost after  realised
--   2026-04-08  BUY  10 AAPL     258.90   10         258.90
--   2026-05-12  BUY   5 MSFT     407.77    5         407.77
--   2026-06-16  BUY  20 NVDA     207.41   20         207.41
--   2026-07-14  BUY   5 AAPL     314.86   15         277.55
--   2026-08-18  SELL 10 NVDA     219.74   10         207.41         +123.30
--
--   Cash: 50000.00 deposited - 10350.35 bought + 2197.40 sold = 41847.05
--
-- Like 001, the user is written by SQL rather than by auth-service, so email,
-- phone and KYC fields are plaintext (FieldEncryptionService reads plaintext
-- unchanged). The password hash is a real bcrypt hash of the password above.

BEGIN;

-- ============================================================
-- USER, ROLE AND KYC (auth)
-- ============================================================

INSERT INTO trading.users (user_id, user_name, password_hash, email, phone, first_name, last_name, status)
VALUES (
    '550e8400-e29b-41d4-a716-446655440006'::uuid,
    'portfolio_demo',
    '$2a$12$TERVirlGP0oSptINMW1Kcu4Z/jUOWPcRP23fYdWNgmbvjMECRzW4G',
    'portfolio.demo@example.com',
    '+353871000006',
    'Priya',
    'Menon',
    'ACTIVE'
);

INSERT INTO auth.users (user_id, user_name, password_hash, email, phone, first_name, last_name, status)
SELECT user_id, user_name, password_hash, email, phone, first_name, last_name, status
FROM trading.users
WHERE user_id = '550e8400-e29b-41d4-a716-446655440006'::uuid;

INSERT INTO auth.user_roles (user_id, role)
VALUES ('550e8400-e29b-41d4-a716-446655440006'::uuid, 'CUSTOMER');

-- KYC already approved, so the customer screens open straight away.
INSERT INTO auth.kyc (user_id, status, date_of_birth, document_type, document_number, submitted_at, reviewed_at)
VALUES (
    '550e8400-e29b-41d4-a716-446655440006'::uuid,
    'APPROVED',
    '1990-04-12',
    'PASSPORT',
    'P6006006',
    '2026-04-01 09:00:00',
    '2026-04-02 10:00:00'
);

-- ============================================================
-- ACCOUNT
-- ============================================================

INSERT INTO trading.trading_accounts (
    trading_account_id,
    account_number,
    user_id,
    available_balance,
    account_status,
    version,
    created_at
) VALUES (
    6,
    'ACC-100006',
    '550e8400-e29b-41d4-a716-446655440006',
    41847.05,
    'ACTIVE',
    0,
    '2026-04-01 09:00:00'
);

-- ============================================================
-- ORDERS (instrument ids: 1 AAPL, 2 MSFT, 6 NVDA)
-- ============================================================
-- LIMIT orders at the day's close, filled at that price. Fills are at
-- 19:55 UTC, just before the US close, so each lies on its candle's date.

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
    created_at,
    updated_at,
    filled_price,
    filled_at,
    realized_avg_cost,
    realized_pnl
) VALUES
(601, 'IDEMP-DEMO-000601', 6, 1, 'BUY',  'LIMIT', 'FILLED', 258.9000, 10.0000,
    '2026-04-08 19:54:00', '2026-04-08 19:55:00', 258.9000, '2026-04-08 19:55:00', NULL, NULL),
(602, 'IDEMP-DEMO-000602', 6, 2, 'BUY',  'LIMIT', 'FILLED', 407.7700, 5.0000,
    '2026-05-12 19:54:00', '2026-05-12 19:55:00', 407.7700, '2026-05-12 19:55:00', NULL, NULL),
(603, 'IDEMP-DEMO-000603', 6, 6, 'BUY',  'LIMIT', 'FILLED', 207.4100, 20.0000,
    '2026-06-16 19:54:00', '2026-06-16 19:55:00', 207.4100, '2026-06-16 19:55:00', NULL, NULL),
(604, 'IDEMP-DEMO-000604', 6, 1, 'BUY',  'LIMIT', 'FILLED', 314.8600, 5.0000,
    '2026-07-14 19:54:00', '2026-07-14 19:55:00', 314.8600, '2026-07-14 19:55:00', NULL, NULL),
(605, 'IDEMP-DEMO-000605', 6, 6, 'SELL', 'LIMIT', 'FILLED', 219.7400, 10.0000,
    '2026-08-18 19:54:00', '2026-08-18 19:55:00', 219.7400, '2026-08-18 19:55:00', 207.4100, 123.3000);

INSERT INTO trading.order_history (order_id, status, timestamp) VALUES
(601, 'NEW',    '2026-04-08 19:54:00'),
(601, 'FILLED', '2026-04-08 19:55:00'),
(602, 'NEW',    '2026-05-12 19:54:00'),
(602, 'FILLED', '2026-05-12 19:55:00'),
(603, 'NEW',    '2026-06-16 19:54:00'),
(603, 'FILLED', '2026-06-16 19:55:00'),
(604, 'NEW',    '2026-07-14 19:54:00'),
(604, 'FILLED', '2026-07-14 19:55:00'),
(605, 'NEW',    '2026-08-18 19:54:00'),
(605, 'FILLED', '2026-08-18 19:55:00');

-- ============================================================
-- POSITIONS AND HOLDINGS (the result of replaying the orders)
-- ============================================================

INSERT INTO trading.positions (
    position_id,
    trading_account_id,
    instrument_id,
    position_status,
    quantity,
    as_of_date,
    average_price,
    trade_type,
    realized_pnl,
    opened_at
) VALUES
(601, 6, 1, 'OPEN', 15.0000, '2026-07-14', 277.5500, 'LONG', 0.00,   '2026-04-08 19:55:00'),
(602, 6, 2, 'OPEN',  5.0000, '2026-05-12', 407.7700, 'LONG', 0.00,   '2026-05-12 19:55:00'),
(603, 6, 6, 'OPEN', 10.0000, '2026-08-18', 207.4100, 'LONG', 123.30, '2026-06-16 19:55:00');

INSERT INTO trading.holdings (
    holding_id,
    demat_account_id,
    instrument_id,
    quantity,
    created_at_date,
    average_price
) VALUES
(601, 6, 1, 15.0000, '2026-04-08', 277.5500),
(602, 6, 2,  5.0000, '2026-05-12', 407.7700),
(603, 6, 6, 10.0000, '2026-06-16', 207.4100);

-- ============================================================
-- WATCHLIST
-- ============================================================

INSERT INTO trading.watchlist (watchlist_id, user_id, watchlist_name, description, created_ts, updated_ts, is_default)
VALUES (601, '550e8400-e29b-41d4-a716-446655440006'::uuid, 'My Watchlist', 'Default watchlist',
        '2026-04-01 09:00:00', '2026-04-01 09:00:00', TRUE);

INSERT INTO trading.watchlist_inst (wlist_id, inst_id) VALUES (601, 1), (601, 2), (601, 6);

SELECT setval(
    'trading.trading_accounts_id_seq',
    COALESCE((SELECT MAX(trading_account_id) FROM trading.trading_accounts), 0) + 1,
    false
);

COMMIT;
