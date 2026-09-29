-- Add PENDING to trading account lifecycle so accounts can be created before KYC approval.
-- Existing accounts keep their status; only default and validation rules are widened.

ALTER TABLE trading.trading_accounts
    DROP CONSTRAINT IF EXISTS chk_account_status;

ALTER TABLE trading.trading_accounts
    DROP CONSTRAINT IF EXISTS chk_trading_account_status;

ALTER TABLE trading.trading_accounts
    ADD CONSTRAINT chk_trading_account_status
        CHECK (account_status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED'));

ALTER TABLE trading.trading_accounts
    ALTER COLUMN account_status SET DEFAULT 'PENDING';
