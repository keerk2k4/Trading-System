-- migrations/022_customer_preferences.sql
-- Customer Preferences module (docs/sprint/customer-preferences.md).
--
-- One row per trading account. Stores REFERENCES only, never copies:
-- - default_account_id: reference to trading.trading_accounts, must belong to
--   the same holder (validated in PreferenceService, not just by FK).
-- - alert_channel: EMAIL | SMS | PUSH, consumed in-process by the
--   notifications module through the CustomerPreferenceResolver interface.
-- Contact details (email/phone) are NOT stored here: auth-service owns them
-- (encrypted), so a second copy would be a leak surface plus a
-- reconciliation problem. Delivery resolves destinations from the owning
-- layer at send time.
-- No Kafka for this module: resolution is an in-process Java interface.

BEGIN;

CREATE TABLE IF NOT EXISTS trading.customer_preferences (
    trading_account_id BIGINT PRIMARY KEY
        REFERENCES trading.trading_accounts (trading_account_id) ON DELETE CASCADE,
    default_account_id BIGINT NULL
        REFERENCES trading.trading_accounts (trading_account_id) ON DELETE SET NULL,
    alert_channel VARCHAR(10) NOT NULL DEFAULT 'EMAIL'
        CHECK (alert_channel IN ('EMAIL', 'SMS', 'PUSH')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_preferences_default_account
    ON trading.customer_preferences (default_account_id);

COMMIT;
