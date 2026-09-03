BEGIN;

-- Orders: frequently queried by trading account
-- ============================================
-- Query 1:
-- Retrieve orders for a trading account
-- WHERE o.trading_account_id = ?
-- ============================================

CREATE INDEX idx_orders_trading_account_id
ON orders(trading_account_id);

-- Orders: frequently queried by instrument

-- ============================================
-- Query 2:
-- Retrieve orders for an instrument
-- WHERE o.instrument_id = ?
-- ============================================

CREATE INDEX idx_orders_instrument_id
ON orders(instrument_id);

-- Order history: retrieve history for a specific order
CREATE INDEX idx_order_history_order_id
ON order_history(order_id);

-- Executions: retrieve executions for a specific order
CREATE INDEX idx_executions_order_id
ON executions(order_id);
-- ============================================
-- Query 3:
-- Retrieve order history for a specific order
-- WHERE oh.order_id = ?
-- ORDER BY oh.created_at
-- ============================================

CREATE INDEX idx_order_history_order_id_created_at
ON order_history(order_id, created_at);


-- ============================================
-- Query 4:
-- Retrieve holdings for a Demat account
-- WHERE h.demat_account_id = ?
-- ORDER BY total_value DESC
-- ============================================

CREATE INDEX idx_holdings_demat_account_id
ON holdings(demat_account_id);


-- ============================================
-- Query 5:
-- Retrieve user's watchlist instruments
-- WHERE w.user_id = ?
-- ============================================

CREATE INDEX idx_watchlist_user_id
ON watchlist(user_id);


-- Watchlist join optimization

CREATE INDEX idx_watchlist_inst_wlist_id
ON watchlist_inst(wlist_id);


CREATE INDEX idx_watchlist_inst_inst_id
ON watchlist_inst(inst_id);


-- ============================================
-- Query 6:
-- Rank holdings by account and value
-- PARTITION BY demat_account_id
-- ============================================

CREATE INDEX idx_holdings_demat_account_value
ON holdings(
    demat_account_id,
    quantity,
    average_price
);


-- ============================================
-- Additional useful indexes based on schema
-- ============================================

-- Positions lookup by trading account

-- Positions: retrieve positions for a trading account
CREATE INDEX idx_positions_trading_account_id
ON positions(trading_account_id);

-- Positions: retrieve positions for an instrument

-- Positions lookup by instrument

CREATE INDEX idx_positions_instrument_id
ON positions(instrument_id);

CREATE UNIQUE INDEX uq_open_position
ON positions (
    trading_account_id,
    instrument_id,
    product_type
)
WHERE position_status = 'OPEN';

-- Settlements: retrieve settlements for a Demat account
-- Executions lookup by order

CREATE INDEX idx_executions_order_id
ON executions(order_id);


-- Settlements lookup by Demat account

CREATE INDEX idx_settlements_demat_account_id
ON settlements(demat_account_id);

-- Holdings: retrieve holdings for a Demat account
CREATE INDEX idx_holdings_demat_account_id
ON holdings(demat_account_id);

-- Holdings: retrieve holdings for an instrument
CREATE INDEX idx_holdings_instrument_id
ON holdings(instrument_id);
-- Account transaction history

-- Account transactions: retrieve transaction history
-- for a particular trading account
CREATE INDEX idx_account_transactions_trading_account_id
ON account_transactions(trading_account_id);


COMMIT;