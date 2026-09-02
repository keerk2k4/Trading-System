BEGIN;

-- ============================================================
-- 1. USERS
-- ============================================================

INSERT INTO users (
    user_id,
    first_name,
    last_name,
    email,
    phone,
    password_hash,
    status
)
OVERRIDING SYSTEM VALUE
VALUES
    (
        1,
        'John',
        'Doe',
        'john.doe@example.com',
        '9876543210',
        'seed-password-hash-john',
        'ACTIVE'
    ),
    (
        2,
        'Jane',
        'Smith',
        'jane.smith@example.com',
        '9876543211',
        'seed-password-hash-jane',
        'ACTIVE'
    ),
    (
        3,
        'Rahul',
        'Sharma',
        'rahul.sharma@example.com',
        '9876543212',
        'seed-password-hash-rahul',
        'ACTIVE'
    );


-- ============================================================
-- 2. TRADING ACCOUNTS
-- ============================================================

INSERT INTO trading_accounts (
    trading_account_id,
    user_id,
    account_number,
    status,
    available_balance,
    blocked_balance,
    account_status
)
OVERRIDING SYSTEM VALUE
VALUES
    (
        1,
        1,
        'TRD000000001',
        'ACTIVE',
        473900.00,
        0.00,
        'ACTIVE'
    ),
    (
        2,
        2,
        'TRD000000002',
        'ACTIVE',
        215000.00,
        0.00,
        'ACTIVE'
    ),
    (
        3,
        3,
        'TRD000000003',
        'ACTIVE',
        60000.00,
        0.00,
        'ACTIVE'
    );


-- ============================================================
-- 3. DEMAT ACCOUNTS
-- ============================================================

INSERT INTO demat_accounts (
    demat_account_id,
    user_id,
    account_number,
    account_status
)
OVERRIDING SYSTEM VALUE
VALUES
    (
        1,
        1,
        'IN300000100001',
        'ACTIVE'
    ),
    (
        2,
        2,
        'IN300000100002',
        'ACTIVE'
    ),
    (
        3,
        3,
        'IN300000100003',
        'ACTIVE'
    );


-- ============================================================
-- 4. INSTRUMENTS
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
VALUES
    (
        1,
        'TCS',
        'Tata Consultancy Services Ltd',
        'NSE',
        'INE467B01029',
        'EQUITY',
        'ACTIVE'
    ),
    (
        2,
        'INFY',
        'Infosys Ltd',
        'NSE',
        'INE009A01021',
        'EQUITY',
        'ACTIVE'
    ),
    (
        3,
        'RELIANCE',
        'Reliance Industries Ltd',
        'NSE',
        'INE002A01018',
        'EQUITY',
        'ACTIVE'
    ),
    (
        4,
        'HDFCBANK',
        'HDFC Bank Ltd',
        'NSE',
        'INE040A01034',
        'EQUITY',
        'ACTIVE'
    ),
    (
        5,
        'TATASTEEL',
        'Tata Steel Ltd',
        'BSE',
        'INE081A01020',
        'EQUITY',
        'ACTIVE'
    );


-- ============================================================
-- 5. ORDERS
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
VALUES

    -- John's delivery purchase
    (
        1,
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

    -- John's intraday purchase
    (
        2,
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

    -- John's cancelled order
    (
        3,
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

    -- Jane's delivery purchase
    (
        4,
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

    -- Jane's delivery sale
    (
        5,
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

    -- Rahul's rejected order
    (
        6,
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
-- ============================================================

INSERT INTO order_history (
    history_id,
    order_id,
    event_type,
    old_status,
    new_status,
    event_data
)
OVERRIDING SYSTEM VALUE
VALUES

    -- Order 1
    (
        1,
        1,
        'ORDER_CREATED',
        NULL,
        'NEW',
        '{"quantity": 100, "side": "BUY"}'
    ),
    (
        2,
        1,
        'ORDER_ACCEPTED',
        'NEW',
        'OPEN',
        NULL
    ),
    (
        3,
        1,
        'ORDER_FILLED',
        'OPEN',
        'FILLED',
        '{"filled_quantity": 100, "execution_price": 3500.00}'
    ),

    -- Order 2
    (
        4,
        2,
        'ORDER_CREATED',
        NULL,
        'NEW',
        '{"quantity": 50, "side": "BUY"}'
    ),
    (
        5,
        2,
        'ORDER_ACCEPTED',
        'NEW',
        'OPEN',
        NULL
    ),
    (
        6,
        2,
        'ORDER_FILLED',
        'OPEN',
        'FILLED',
        '{"filled_quantity": 50, "execution_price": 3520.00}'
    ),

    -- Order 3
    (
        7,
        3,
        'ORDER_CREATED',
        NULL,
        'NEW',
        '{"quantity": 100, "side": "BUY"}'
    ),
    (
        8,
        3,
        'ORDER_ACCEPTED',
        'NEW',
        'OPEN',
        NULL
    ),
    (
        9,
        3,
        'ORDER_CANCELLED',
        'OPEN',
        'CANCELLED',
        '{"reason": "User cancelled order"}'
    ),

    -- Order 4
    (
        10,
        4,
        'ORDER_CREATED',
        NULL,
        'NEW',
        '{"quantity": 50, "side": "BUY"}'
    ),
    (
        11,
        4,
        'ORDER_ACCEPTED',
        'NEW',
        'OPEN',
        NULL
    ),
    (
        12,
        4,
        'ORDER_FILLED',
        'OPEN',
        'FILLED',
        '{"filled_quantity": 50, "execution_price": 2900.00}'
    ),

    -- Order 5
    (
        13,
        5,
        'ORDER_CREATED',
        NULL,
        'NEW',
        '{"quantity": 20, "side": "SELL"}'
    ),
    (
        14,
        5,
        'ORDER_ACCEPTED',
        'NEW',
        'OPEN',
        NULL
    ),
    (
        15,
        5,
        'ORDER_FILLED',
        'OPEN',
        'FILLED',
        '{"filled_quantity": 20, "execution_price": 3000.00}'
    ),

    -- Order 6
    (
        16,
        6,
        'ORDER_CREATED',
        NULL,
        'NEW',
        '{"quantity": 100, "side": "BUY"}'
    ),
    (
        17,
        6,
        'ORDER_REJECTED',
        'NEW',
        'REJECTED',
        '{"reason": "Insufficient funds"}'
    );


-- ============================================================
-- 7. EXECUTIONS
-- ============================================================

INSERT INTO executions (
    execution_id,
    order_id,
    execution_reference,
    execution_quantity,
    execution_price
)
OVERRIDING SYSTEM VALUE
VALUES
    (
        1,
        1,
        'EXE-TCS-0001',
        100,
        3500.00
    ),
    (
        2,
        2,
        'EXE-TCS-0002',
        50,
        3520.00
    ),
    (
        3,
        4,
        'EXE-REL-0001',
        50,
        2900.00
    ),
    (
        4,
        5,
        'EXE-REL-0002',
        20,
        3000.00
    );


-- ============================================================
-- 8. POSITIONS
-- ============================================================

INSERT INTO positions (
    position_id,
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
OVERRIDING SYSTEM VALUE
VALUES

    -- John's delivery position has been settled into holdings.
    -- Therefore the active position quantity is now zero.
    (
        1,
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

    -- John's intraday position is still open.
    (
        2,
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

    -- Jane's delivery position has been settled.
    -- Remaining 30 shares are represented in holdings.
    (
        3,
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
-- ============================================================

INSERT INTO settlements (
    settlement_id,
    execution_id,
    demat_account_id,
    quantity,
    settlement_date,
    status
)
OVERRIDING SYSTEM VALUE
VALUES
    (
        1,
        1,
        1,
        100,
        CURRENT_DATE,
        'SETTLED'
    ),
    (
        2,
        3,
        2,
        50,
        CURRENT_DATE,
        'SETTLED'
    ),
    (
        3,
        4,
        2,
        20,
        CURRENT_DATE,
        'SETTLED'
    );


-- ============================================================
-- 10. HOLDINGS
-- ============================================================

INSERT INTO holdings (
    holding_id,
    demat_account_id,
    instrument_id,
    quantity,
    average_price
)
OVERRIDING SYSTEM VALUE
VALUES
    (
        1,
        1,
        1,
        100,
        3500.00
    ),
    (
        2,
        2,
        3,
        30,
        2900.00
    );


-- ============================================================
-- 11. ACCOUNT TRANSACTIONS
-- ============================================================

INSERT INTO account_transactions (
    transaction_id,
    trading_account_id,
    transaction_type,
    amount,
    direction,
    reference_type,
    reference_id,
    description
)
OVERRIDING SYSTEM VALUE
VALUES

    -- -------------------------
    -- JOHN
    -- -------------------------

    -- Initial deposit
    (
        1,
        1,
        'DEPOSIT',
        1000000.00,
        'CREDIT',
        NULL,
        NULL,
        'Initial account deposit'
    ),

    -- TCS delivery purchase
    (
        2,
        1,
        'BUY',
        350000.00,
        'DEBIT',
        'ORDER',
        1,
        'Purchase of 100 TCS shares'
    ),

    -- TCS intraday purchase
    (
        3,
        1,
        'BUY',
        176000.00,
        'DEBIT',
        'ORDER',
        2,
        'Purchase of 50 TCS shares for intraday'
    ),

    -- Brokerage
    (
        4,
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

    -- Initial deposit
    (
        5,
        2,
        'DEPOSIT',
        300000.00,
        'CREDIT',
        NULL,
        NULL,
        'Initial account deposit'
    ),

    -- Reliance purchase
    (
        6,
        2,
        'BUY',
        145000.00,
        'DEBIT',
        'ORDER',
        4,
        'Purchase of 50 Reliance shares'
    ),

    -- Reliance sale
    (
        7,
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

    -- Initial deposit
    (
        8,
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