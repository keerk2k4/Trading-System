-- Audit trail for trading-account status changes made by an admin.
--
-- One row per change: the account, the status it moved from and to, the
-- reason the admin gave, which admin (the `sub` claim of their token, an
-- auth.users id) and when. Rows are only ever inserted; nothing updates or
-- deletes them, so the history of a suspension, block or closure survives.

CREATE TABLE IF NOT EXISTS trading.account_status_changes (
    change_id          BIGSERIAL    PRIMARY KEY,
    trading_account_id BIGINT       NOT NULL
        REFERENCES trading.trading_accounts (trading_account_id),
    from_status        VARCHAR(20)  NOT NULL,
    to_status          VARCHAR(20)  NOT NULL,
    reason             VARCHAR(500) NOT NULL,
    changed_by         VARCHAR(64)  NOT NULL,
    changed_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_status_change_from
        CHECK (from_status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED')),
    CONSTRAINT chk_status_change_to
        CHECK (to_status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED')),
    CONSTRAINT chk_status_change_moves
        CHECK (from_status <> to_status),
    CONSTRAINT chk_status_change_reason
        CHECK (length(btrim(reason)) > 0)
);

-- The admin screen reads one account's history, newest first.
CREATE INDEX IF NOT EXISTS idx_account_status_changes_account
    ON trading.account_status_changes (trading_account_id, changed_at DESC);
