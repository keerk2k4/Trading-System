-- migrations/024_create_strategy_preferences.sql
-- Strategy preferences: customer-defined trigger rules that submit MARKET
-- orders when a live quote reaches the configured threshold.

BEGIN;

CREATE TABLE IF NOT EXISTS trading.strategy_preferences (
    strategy_id BIGINT PRIMARY KEY,
    trading_account_id BIGINT NOT NULL
        REFERENCES trading.trading_accounts (trading_account_id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    target_price NUMERIC(18,2) NOT NULL CHECK (target_price > 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'TRIGGERING', 'TRIGGERED', 'CANCELLED')),
    triggered_order_id VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    triggered_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_strategy_preferences_symbol_status
    ON trading.strategy_preferences (symbol, status);

CREATE INDEX IF NOT EXISTS idx_strategy_preferences_account_status
    ON trading.strategy_preferences (trading_account_id, status);

COMMIT;
