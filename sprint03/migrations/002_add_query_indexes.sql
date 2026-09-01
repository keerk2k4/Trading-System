BEGIN;

-- Orders: frequently queried by trading account
CREATE INDEX idx_orders_trading_account_id
ON orders(trading_account_id);

-- Orders: frequently queried by instrument
CREATE INDEX idx_orders_instrument_id
ON orders(instrument_id);

-- Order history: retrieve history for a specific order
CREATE INDEX idx_order_history_order_id
ON order_history(order_id);

-- Executions: retrieve executions for a specific order
CREATE INDEX idx_executions_order_id
ON executions(order_id);

-- Positions: retrieve positions for a trading account
CREATE INDEX idx_positions_trading_account_id
ON positions(trading_account_id);

-- Positions: retrieve positions for an instrument
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
CREATE INDEX idx_settlements_demat_account_id
ON settlements(demat_account_id);

-- Holdings: retrieve holdings for a Demat account
CREATE INDEX idx_holdings_demat_account_id
ON holdings(demat_account_id);

-- Holdings: retrieve holdings for an instrument
CREATE INDEX idx_holdings_instrument_id
ON holdings(instrument_id);

-- Account transactions: retrieve transaction history
-- for a particular trading account
CREATE INDEX idx_account_transactions_trading_account_id
ON account_transactions(trading_account_id);

COMMIT;