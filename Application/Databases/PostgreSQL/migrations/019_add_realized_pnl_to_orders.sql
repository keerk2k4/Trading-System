-- migrations/019_add_realized_pnl_to_orders.sql
-- Realised profit and loss on FILLED SELL orders, weighted average cost method.
--
-- positions.average_price is the weighted average cost of the shares held:
-- a BUY recalculates it, a SELL leaves it unchanged. When a SELL is FILLED the
-- executor (SettlementService) records on the order:
--   realized_avg_cost = positions.average_price at the moment of the sale
--   realized_pnl      = (filled_price - realized_avg_cost) x quantity
-- order-service derives the percentage as
--   realized_pnl / (realized_avg_cost x quantity) x 100.
-- Both stay NULL for BUY orders, unfilled orders, and sells whose cost basis
-- is unknown (see the backfill below).
--
-- Example: BUY 5 @ 100, BUY 3 @ 90 -> average (5x100 + 3x90) / 8 = 96.25
--          SELL 2 @ 96             -> realized_pnl = (96 - 96.25) x 2 = -0.50
--
-- Replaces the FIFO trading.order_pair table from an earlier draft of this
-- feature; it is dropped if a local database still has it.

BEGIN;

DROP TABLE IF EXISTS trading.order_pair;

ALTER TABLE trading.orders ADD COLUMN IF NOT EXISTS realized_avg_cost NUMERIC(18,4);
ALTER TABLE trading.orders ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC(18,4);

-- ------------------------------------------------------------
-- Backfill SELLs filled before the executor recorded these columns, by
-- replaying each account's fills per instrument in fill order with the same
-- rules as SettlementService: a BUY updates the average (rounded to 2 dp),
-- a SELL keeps it, and selling the last share resets the position. Orders
-- filled before filled_price/filled_at existed fall back to limit_price and
-- created_at. A SELL larger than the replayed holding (e.g. holdings seeded
-- straight into positions, with no BUY order behind them) has an unknown
-- cost basis and stays NULL.
-- ------------------------------------------------------------
DO $$
DECLARE
    fill         RECORD;
    current_key  TEXT := NULL;
    held         INTEGER := 0;
    avg_cost     NUMERIC(18,4) := 0;
BEGIN
    FOR fill IN
        SELECT o.order_id,
               o.trading_account_id || ':' || o.instrument_id AS position_key,
               o.side,
               CAST(o.quantity AS INTEGER) AS quantity,
               COALESCE(o.filled_price, o.limit_price) AS price,
               o.realized_pnl
        FROM trading.orders o
        WHERE o.status = 'FILLED'
        ORDER BY o.trading_account_id, o.instrument_id,
                 COALESCE(o.filled_at, o.created_at), o.order_id
    LOOP
        IF current_key IS DISTINCT FROM fill.position_key THEN
            current_key := fill.position_key;
            held := 0;
            avg_cost := 0;
        END IF;

        IF fill.side = 'BUY' THEN
            avg_cost := ROUND((avg_cost * held + fill.price * fill.quantity) / (held + fill.quantity), 2);
            held := held + fill.quantity;
        ELSIF fill.side = 'SELL' THEN
            IF held >= fill.quantity AND held > 0 THEN
                IF fill.realized_pnl IS NULL THEN
                    UPDATE trading.orders
                    SET realized_avg_cost = avg_cost,
                        realized_pnl = (fill.price - avg_cost) * fill.quantity
                    WHERE order_id = fill.order_id;
                END IF;
                held := held - fill.quantity;
            ELSE
                RAISE NOTICE 'realized P&L backfill: SELL order % sells % but only % recorded as held; left NULL',
                    fill.order_id, fill.quantity, held;
                held := 0;
            END IF;
            IF held = 0 THEN
                avg_cost := 0;
            END IF;
        END IF;
    END LOOP;
END $$;

COMMIT;
