BEGIN;

CREATE INDEX idx_orders_account_id
ON orders(account_id);

CREATE INDEX idx_orders_instrument_id
ON orders(instrument_id);

CREATE INDEX idx_holdings_account_id
ON holdings(account_id);

COMMIT;
