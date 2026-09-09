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
    -900000000003,
    'Harness Orphan Test User',
    'harness-password',
    'harness-orphan@example.com',
    '-900000000003',
    'Harness',
    'Orphan'
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
    -900000000003,
    'HARNORPH',
    'Harness Orphan Test Instrument',
    'Temporary instrument for orphan foreign-key probe',
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
    -900000000003,
    'HARNESS-ORPHAN-FOREIGN-KEY',
    999999999999,
    -900000000003,
    'BUY',
    'LIMIT',
    'NEW',
    100.0000,
    10.0000
);

ROLLBACK;
