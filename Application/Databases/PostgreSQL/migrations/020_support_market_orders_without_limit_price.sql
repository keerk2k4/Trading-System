-- migrations/020_support_market_orders_without_limit_price.sql
-- Enables MARKET orders to persist with NULL limit_price while preserving
-- existing LIMIT-order behavior and keeping SQL-level safety checks.

BEGIN;

-- Keep domain and DB enum/value checks aligned. Existing data can still hold
-- STOP from earlier schemas; STOP_LOSS is the current domain value.
ALTER TABLE trading.orders
DROP CONSTRAINT IF EXISTS chk_order_type;

ALTER TABLE trading.orders
ADD CONSTRAINT chk_order_type
CHECK (order_type IN ('MARKET', 'LIMIT', 'STOP', 'STOP_LOSS', 'STOP_LIMIT'));

-- MARKET orders do not carry a limit price.
ALTER TABLE trading.orders
ALTER COLUMN limit_price DROP NOT NULL;

-- Positive price only when a limit price is present.
ALTER TABLE trading.orders
DROP CONSTRAINT IF EXISTS chk_order_price;

ALTER TABLE trading.orders
ADD CONSTRAINT chk_order_price
CHECK (limit_price IS NULL OR limit_price > 0);

-- Normalize pre-existing MARKET rows so the stricter constraint can be added
-- safely on databases that already contain historical data.
-- Keep historical filled price information where possible.
UPDATE trading.orders
SET filled_price = COALESCE(filled_price, limit_price)
WHERE order_type = 'MARKET'
    AND status = 'FILLED'
    AND limit_price IS NOT NULL;

UPDATE trading.orders
SET limit_price = NULL
WHERE order_type = 'MARKET'
    AND limit_price IS NOT NULL;

-- Guard against invalid type/price combinations:
-- 1) MARKET must not provide a limit_price
-- 2) LIMIT must provide a positive limit_price
-- 3) STOP/STOP_LOSS/STOP_LIMIT remain governed by application logic
ALTER TABLE trading.orders
DROP CONSTRAINT IF EXISTS chk_order_type_limit_price;

ALTER TABLE trading.orders
ADD CONSTRAINT chk_order_type_limit_price
CHECK (
    (order_type = 'MARKET' AND limit_price IS NULL)
    OR (order_type = 'LIMIT' AND limit_price IS NOT NULL)
    OR (order_type IN ('STOP', 'STOP_LOSS', 'STOP_LIMIT'))
);

COMMIT;
