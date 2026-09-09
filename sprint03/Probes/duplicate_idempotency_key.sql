BEGIN;

INSERT INTO users (
    user_id,
    user_name,
    password_hash,
    email,
    phone,
    first_name,
    last_name
)
VALUES (
    -900000000001,
    'Harness Duplicate Test User',
    'harness-password',
    'harness-duplicate@example.com',
    '-900000000001',
    'Harness',
    'Duplicate'
);

INSERT INTO trading_accounts (
    trading_account_id,
    account_number,
    user_id,
    available_balance,
    account_status,
    version
)
VALUES (
    -900000000001,
    'HARNESS-DUP-ACCOUNT',
    -900000000001,
    10000.00,
    'ACTIVE',
    0
);

INSERT INTO instruments (
    instrument_id,
    symbol,
    display_name,
    description,
    status,
    availability,
    price
)
VALUES (
    -900000000001,
    'HARNDUP',
    'Harness Duplicate Test Instrument',
    'Temporary instrument for duplicate idempotency probe',
    'ACTIVE',
    TRUE,
    100.0000
);

INSERT INTO orders (
    order_id,
    idempotency_key,
    trading_account_id,
    instrument_id,
    side,
    order_type,
    status,
    limit_price,
    quantity
)
VALUES (
    -900000000001,
    'HARNESS-DUPLICATE-IDEMPOTENCY-KEY',
    -900000000001,
    -900000000001,
    'BUY',
    'LIMIT',
    'NEW',
    100.0000,
    10.0000
);

INSERT INTO orders (
    order_id,
    idempotency_key,
    trading_account_id,
    instrument_id,
    side,
    order_type,
    status,
    limit_price,
    quantity
)
VALUES (
    -900000000002,
    'HARNESS-DUPLICATE-IDEMPOTENCY-KEY',
    -900000000001,
    -900000000001,
    'BUY',
    'LIMIT',
    'NEW',
    100.0000,
    10.0000
);

ROLLBACK;
