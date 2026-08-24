BEGIN;

INSERT INTO users (
    user_id,
    user_name,
    password,
    email,
    phonenumber
)
VALUES (
    -900000000001,
    'Harness Duplicate Test User',
    'harness-password',
    'harness-duplicate@example.com',
    '-900000000001'
);

INSERT INTO accounts (
    account_id,
    account_num,
    user_id,
    balance,
    status,
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
    ticker_symbol,
    name,
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
    account_id,
    instrument_id,
    action,
    type,
    status,
    price,
    quantity
)
VALUES (
    -900000000001,
    'HARNESS-DUPLICATE-IDEMPOTENCY-KEY',
    -900000000001,
    -900000000001,
    'BUY',
    'LIMIT',
    'PENDING',
    100.0000,
    10.0000
);

INSERT INTO orders (
    order_id,
    idempotency_key,
    account_id,
    instrument_id,
    action,
    type,
    status,
    price,
    quantity
)
VALUES (
    -900000000002,
    'HARNESS-DUPLICATE-IDEMPOTENCY-KEY',
    -900000000001,
    -900000000001,
    'BUY',
    'LIMIT',
    'PENDING',
    100.0000,
    10.0000
);

ROLLBACK;