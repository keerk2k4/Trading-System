-- migrations/005_add_executor_columns.sql
-- Added in Sprint 7: Trade Executor
-- Adds columns needed for order settlement and settlement event publishing.
-- These columns are written by the executor when an order is filled or rejected.

BEGIN;

-- ============================================================
-- ORDERS
-- ============================================================
-- Add executor-written columns for tracking execution details:
-- - filled_price: the price at which the order was actually filled (null if not FILLED)
-- - filled_at: timestamp when the order was filled or rejected
-- - executor_version: internal version for tracking executor-specific state changes

ALTER TABLE orders ADD COLUMN filled_price NUMERIC(18,4);
ALTER TABLE orders ADD COLUMN filled_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN executor_version BIGINT NOT NULL DEFAULT 0;

-- Add constraint to ensure filled_price is only set when order is FILLED
ALTER TABLE orders ADD CONSTRAINT chk_order_filled_price
    CHECK ((status = 'FILLED' AND filled_price IS NOT NULL) OR
           (status != 'FILLED' AND filled_price IS NULL));

-- Add constraint to ensure filled_at is set for FILLED/REJECTED orders
ALTER TABLE orders ADD CONSTRAINT chk_order_filled_at
    CHECK ((status IN ('FILLED', 'REJECTED') AND filled_at IS NOT NULL) OR
           (status NOT IN ('FILLED', 'REJECTED')));

-- ============================================================
-- POSITIONS
-- ============================================================
-- Add columns for tracking when position was last modified by executor
-- - executor_version: version tracking for executor state changes

ALTER TABLE positions ADD COLUMN executor_version BIGINT NOT NULL DEFAULT 0;

COMMIT;

