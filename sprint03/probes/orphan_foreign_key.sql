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
    999999,
    1,
    'MARKET',
    'BUY',
    'DELIVERY',
    10,
    'NEW',
    'HARNESS_ORPHAN_KEY'
);


ROLLBACK;