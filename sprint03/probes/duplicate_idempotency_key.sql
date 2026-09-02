BEGIN;


INSERT INTO orders
(
    trading_account_id,
    instrument_id,
    order_type,
    side,
    product_type,
    quantity,
    status,
    idempotency_key
)
VALUES
(
    1,
    1,
    'MARKET',
    'BUY',
    'DELIVERY',
    10,
    'NEW',
    'HARNESS_DUPLICATE_KEY'
);



INSERT INTO orders
(
    trading_account_id,
    instrument_id,
    order_type,
    side,
    product_type,
    quantity,
    status,
    idempotency_key
)
VALUES
(
    1,
    1,
    'MARKET',
    'BUY',
    'DELIVERY',
    10,
    'NEW',
    'HARNESS_DUPLICATE_KEY'
);


ROLLBACK;