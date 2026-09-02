BEGIN;

-- ============================================================
-- 1. USERS
-- Identity column user_id generated automatically
-- ============================================================

INSERT INTO users (
    first_name,
    last_name,
    email,
    phone,
    password_hash,
    status
)
VALUES
(
    'John',
    'Doe',
    'john.doe@example.com',
    '9876543210',
    'seed-password-hash-john',
    'ACTIVE'
),
(
    'Jane',
    'Smith',
    'jane.smith@example.com',
    '9876543211',
    'seed-password-hash-jane',
    'ACTIVE'
),
(
    'Rahul',
    'Sharma',
    'rahul.sharma@example.com',
    '9876543212',
    'seed-password-hash-rahul',
    'ACTIVE'
);


-- ============================================================
-- 2. TRADING ACCOUNTS
-- trading_account_id generated automatically
-- ============================================================

INSERT INTO trading_accounts (
    user_id,
    account_number,
    status,
    available_balance,
    blocked_balance,
    account_status
)
VALUES
(
    1,
    'TRD000000001',
    'ACTIVE',
    473900.00,
    0.00,
    'ACTIVE'
),
(
    2,
    'TRD000000002',
    'ACTIVE',
    215000.00,
    0.00,
    'ACTIVE'
),
(
    3,
    'TRD000000003',
    'ACTIVE',
    60000.00,
    0.00,
    'ACTIVE'
);


-- ============================================================
-- 3. DEMAT ACCOUNTS
-- demat_account_id generated automatically
-- ============================================================

INSERT INTO demat_accounts (
    user_id,
    account_number,
    account_status
)
VALUES
(
    1,
    'IN300000100001',
    'ACTIVE'
),
(
    2,
    'IN300000100002',
    'ACTIVE'
),
(
    3,
    'IN300000100003',
    'ACTIVE'
);


-- ============================================================
-- 4. INSTRUMENTS
-- instrument_id generated automatically
-- ============================================================

INSERT INTO instruments (
    symbol,
    company_name,
    exchange,
    isin,
    instrument_type,
    status
)
VALUES
(
    'TCS',
    'Tata Consultancy Services Ltd',
    'NSE',
    'INE467B01029',
    'EQUITY',
    'ACTIVE'
),
(
    'INFY',
    'Infosys Ltd',
    'NSE',
    'INE009A01021',
    'EQUITY',
    'ACTIVE'
),
(
    'RELIANCE',
    'Reliance Industries Ltd',
    'NSE',
    'INE002A01018',
    'EQUITY',
    'ACTIVE'
),
(
    'HDFCBANK',
    'HDFC Bank Ltd',
    'NSE',
    'INE040A01034',
    'EQUITY',
    'ACTIVE'
),
(
    'TATASTEEL',
    'Tata Steel Ltd',
    'BSE',
    'INE081A01020',
    'EQUITY',
    'ACTIVE'
);


-- ============================================================
-- 5. ORDERS
-- order_id generated automatically
-- ============================================================

INSERT INTO orders (
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
VALUES

(
    1,
    1,
    'LIMIT',
    'BUY',
    'DELIVERY',
    100,
    3500.00,
    NULL,
    'FILLED',
    'JOHN-TCS-BUY-001'
),

(
    1,
    1,
    'LIMIT',
    'BUY',
    'INTRADAY',
    50,
    3520.00,
    NULL,
    'FILLED',
    'JOHN-TCS-INTRA-001'
),

(
    1,
    2,
    'LIMIT',
    'BUY',
    'DELIVERY',
    100,
    1600.00,
    NULL,
    'CANCELLED',
    'JOHN-INFY-BUY-001'
),

(
    2,
    3,
    'LIMIT',
    'BUY',
    'DELIVERY',
    50,
    2900.00,
    NULL,
    'FILLED',
    'JANE-RELIANCE-BUY-001'
),

(
    2,
    3,
    'LIMIT',
    'SELL',
    'DELIVERY',
    20,
    3000.00,
    NULL,
    'FILLED',
    'JANE-RELIANCE-SELL-001'
),

(
    3,
    4,
    'LIMIT',
    'BUY',
    'DELIVERY',
    100,
    1800.00,
    NULL,
    'REJECTED',
    'RAHUL-HDFC-BUY-001'
);

-- ============================================================
-- 6. ORDER HISTORY
-- history_id generated automatically
-- ============================================================

INSERT INTO order_history (
    order_id,
    event_type,
    old_status,
    new_status,
    event_data
)
VALUES

(
    1,
    'ORDER_CREATED',
    NULL,
    'NEW',
    '{"quantity": 100, "side": "BUY"}'
),
(
    1,
    'ORDER_ACCEPTED',
    'NEW',
    'OPEN',
    NULL
),
(
    1,
    'ORDER_FILLED',
    'OPEN',
    'FILLED',
    '{"filled_quantity": 100, "execution_price": 3500.00}'
),

(
    2,
    'ORDER_CREATED',
    NULL,
    'NEW',
    '{"quantity": 50, "side": "BUY"}'
),
(
    2,
    'ORDER_ACCEPTED',
    'NEW',
    'OPEN',
    NULL
),
(
    2,
    'ORDER_FILLED',
    'OPEN',
    'FILLED',
    '{"filled_quantity": 50, "execution_price": 3520.00}'
),

(
    3,
    'ORDER_CREATED',
    NULL,
    'NEW',
    '{"quantity": 100, "side": "BUY"}'
),
(
    3,
    'ORDER_ACCEPTED',
    'NEW',
    'OPEN',
    NULL
),
(
    3,
    'ORDER_CANCELLED',
    'OPEN',
    'CANCELLED',
    '{"reason": "User cancelled order"}'
),

(
    4,
    'ORDER_CREATED',
    NULL,
    'NEW',
    '{"quantity": 50, "side": "BUY"}'
),
(
    4,
    'ORDER_ACCEPTED',
    'NEW',
    'OPEN',
    NULL
),
(
    4,
    'ORDER_FILLED',
    'OPEN',
    'FILLED',
    '{"filled_quantity": 50, "execution_price": 2900.00}'
),

(
    5,
    'ORDER_CREATED',
    NULL,
    'NEW',
    '{"quantity": 20, "side": "SELL"}'
),
(
    5,
    'ORDER_ACCEPTED',
    'NEW',
    'OPEN',
    NULL
),
(
    5,
    'ORDER_FILLED',
    'OPEN',
    'FILLED',
    '{"filled_quantity": 20, "execution_price": 3000.00}'
),

(
    6,
    'ORDER_CREATED',
    NULL,
    'NEW',
    '{"quantity": 100, "side": "BUY"}'
),
(
    6,
    'ORDER_REJECTED',
    'NEW',
    'REJECTED',
    '{"reason": "Insufficient funds"}'
);



-- ============================================================
-- 7. EXECUTIONS
-- execution_id generated automatically
-- ============================================================

INSERT INTO executions (
    order_id,
    execution_reference,
    execution_quantity,
    execution_price
)
VALUES
(
    1,
    'EXE-TCS-0001',
    100,
    3500.00
),
(
    2,
    'EXE-TCS-0002',
    50,
    3520.00
),
(
    4,
    'EXE-REL-0001',
    50,
    2900.00
),
(
    5,
    'EXE-REL-0002',
    20,
    3000.00
);



-- ============================================================
-- 8. POSITIONS
-- position_id generated automatically
-- ============================================================

INSERT INTO positions (
    trading_account_id,
    instrument_id,
    product_type,
    quantity,
    average_price,
    realized_pnl,
    position_status,
    opened_at,
    closed_at
)
VALUES

(
    1,
    1,
    'DELIVERY',
    0,
    3500.00,
    0.00,
    'CLOSED',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),

(
    1,
    1,
    'INTRADAY',
    50,
    3520.00,
    0.00,
    'OPEN',
    CURRENT_TIMESTAMP,
    NULL
),

(
    2,
    3,
    'DELIVERY',
    0,
    2900.00,
    2000.00,
    'CLOSED',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);



-- ============================================================
-- 9. SETTLEMENTS
-- settlement_id generated automatically
-- ============================================================

INSERT INTO settlements (
    execution_id,
    demat_account_id,
    quantity,
    settlement_date,
    status
)
VALUES
(
    1,
    1,
    100,
    CURRENT_DATE,
    'SETTLED'
),
(
    3,
    2,
    50,
    CURRENT_DATE,
    'SETTLED'
),
(
    4,
    2,
    20,
    CURRENT_DATE,
    'SETTLED'
);



-- ============================================================
-- 10. HOLDINGS
-- holding_id generated automatically
-- ============================================================

INSERT INTO holdings (
    demat_account_id,
    instrument_id,
    quantity,
    average_price
)
VALUES
(
    1,
    1,
    100,
    3500.00
),
(
    2,
    3,
    30,
    2900.00
);

-- ============================================================
-- 11. ACCOUNT TRANSACTIONS
-- transaction_id generated automatically
-- ============================================================

INSERT INTO account_transactions (
    trading_account_id,
    transaction_type,
    amount,
    direction,
    reference_type,
    reference_id,
    description
)
VALUES

-- -------------------------
-- JOHN
-- -------------------------

(
    1,
    'DEPOSIT',
    1000000.00,
    'CREDIT',
    NULL,
    NULL,
    'Initial account deposit'
),

(
    1,
    'BUY',
    350000.00,
    'DEBIT',
    'ORDER',
    1,
    'Purchase of 100 TCS shares'
),

(
    1,
    'BUY',
    176000.00,
    'DEBIT',
    'ORDER',
    2,
    'Purchase of 50 TCS shares for intraday'
),

(
    1,
    'BROKERAGE',
    100.00,
    'DEBIT',
    'ORDER',
    1,
    'Brokerage for TCS purchase'
),


-- -------------------------
-- JANE
-- -------------------------

(
    2,
    'DEPOSIT',
    300000.00,
    'CREDIT',
    NULL,
    NULL,
    'Initial account deposit'
),

(
    2,
    'BUY',
    145000.00,
    'DEBIT',
    'ORDER',
    4,
    'Purchase of 50 Reliance shares'
),

(
    2,
    'SELL',
    60000.00,
    'CREDIT',
    'ORDER',
    5,
    'Sale of 20 Reliance shares'
),


-- -------------------------
-- RAHUL
-- -------------------------

(
    3,
    'DEPOSIT',
    60000.00,
    'CREDIT',
    NULL,
    NULL,
    'Initial account deposit'
);



-- ============================================================
-- 12. WATCHLISTS
-- watchlist_id is NOT identity, keep manual values
-- ============================================================

INSERT INTO watchlist (
    watchlist_id,
    user_id,
    watchlist_name,
    description
)
VALUES
(
    1,
    1,
    'My Stocks',
    'John''s favourite stocks'
),
(
    2,
    2,
    'Long Term',
    'Jane''s long-term investment watchlist'
);



-- ============================================================
-- 13. WATCHLIST INSTRUMENTS
-- Composite primary key, keep manual values
-- ============================================================

INSERT INTO watchlist_inst (
    wlist_id,
    inst_id
)
VALUES
(1, 1), -- John -> TCS
(1, 2), -- John -> INFY
(1, 3), -- John -> RELIANCE
(2, 3), -- Jane -> RELIANCE
(2, 4); -- Jane -> HDFCBANK



COMMIT;