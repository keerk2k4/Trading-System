-- migrations/021_order_update_and_delayed_settlement.sql
-- Supports cancellable/updatable LIMIT orders and T+15s holdings settlement.
--
-- 1) Order updates happen in place while status = 'NEW' (guarded
--    WHERE status='NEW'), so no schema change is needed for quantity/price.
--    This migration only adds the indexes that make those guarded writes
--    and the executor's post-delay re-reads cheap.
-- 2) Settlement: a FILLED order moves cash + positions immediately; holdings
--    (demat) follow after app.settlement.holdings-delay-ms (15s). The delayed
--    leg is tracked in trading.settlement_jobs so a restart can resume it and
--    the database shows PENDING -> COMPLETE per order.

BEGIN;

-- Guarded NEW -> * transitions and the executor's re-read after the LIMIT delay.
CREATE INDEX IF NOT EXISTS idx_orders_status_created
    ON trading.orders (status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_account_status
    ON trading.orders (trading_account_id, status);

-- Delayed holdings settlement queue (one row per FILLED DELIVERY order).
CREATE TABLE IF NOT EXISTS trading.settlement_jobs (
    settlement_job_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES trading.orders (order_id) ON DELETE CASCADE,
    trading_account_id BIGINT NOT NULL REFERENCES trading.trading_accounts (trading_account_id) ON DELETE CASCADE,
    instrument_id BIGINT NOT NULL REFERENCES trading.instruments (instrument_id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    side VARCHAR(10) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETE', 'FAILED')),
    due_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 seconds'),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_settlement_jobs_due
    ON trading.settlement_jobs (status, due_at);

-- Holdings lookups used by the delayed settlement applier.
CREATE INDEX IF NOT EXISTS idx_holdings_account_instrument
    ON trading.holdings (demat_account_id, instrument_id);
CREATE INDEX IF NOT EXISTS idx_positions_account_instrument
    ON trading.positions (trading_account_id, instrument_id);

COMMIT;
