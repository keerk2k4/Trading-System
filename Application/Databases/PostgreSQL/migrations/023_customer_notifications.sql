-- migrations/023_customer_notifications.sql
-- Customer Notifications module (docs/sprint/customer-notifications.md).
--
-- trading.notifications is the delivery ledger. It is SEPARATE from the Kafka
-- offset: the consumer commits the offset once the row is durably stored
-- (QUEUED), then resolves the channel and attempts delivery independently
-- (SENT / FAILED). At-least-once redelivery is a no-op via the UNIQUE
-- constraint on event_id (the Kafka eventId), the same discipline the Trade
-- Executor uses for guarded order transitions.
-- The resolved channel is persisted on every row so historical routing never
-- has to be reconstructed from current preferences.

BEGIN;

CREATE TABLE IF NOT EXISTS trading.notifications (
    notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id VARCHAR(100) NOT NULL UNIQUE,
    trading_account_id BIGINT NOT NULL
        REFERENCES trading.trading_accounts (trading_account_id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL
        CHECK (type IN ('ORDER_FILLED', 'ORDER_REJECTED', 'ORDER_CANCELLED', 'PRICE_ALERT')),
    title VARCHAR(150) NOT NULL,
    message VARCHAR(500) NOT NULL,
    channel VARCHAR(10) NOT NULL
        CHECK (channel IN ('EMAIL', 'SMS', 'PUSH')),
    status VARCHAR(10) NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED', 'SENT', 'FAILED')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    failed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_account_created
    ON trading.notifications (trading_account_id, created_at DESC);

COMMIT;
