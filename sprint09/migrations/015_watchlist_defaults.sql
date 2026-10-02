-- migrations/015_watchlist_defaults.sql
-- Adds default-watchlist support and membership uniqueness to the existing
-- trading.watchlist / trading.watchlist_inst design from 001. No tables are
-- renamed or duplicated.
--
-- 1. watchlist.is_default marks the per-user default list (one per user).
-- 2. Unique index on (user_id, LOWER(watchlist_name)) prevents duplicate
--    names per user (the PK on watchlist_inst already prevents duplicate
--    instruments within one list).
-- 3. Partial unique index guarantees at most one default list per user.
-- 4. Helpful lookup index for the market-data poller's DISTINCT symbol query.

BEGIN;

ALTER TABLE trading.watchlist
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: oldest watchlist per user becomes the default where no default exists.
-- Seed data (002) has no 'Default' list, so this keeps existing users working
-- while new users get an explicit 'Default' list from WatchlistService.
UPDATE trading.watchlist w
SET is_default = TRUE
WHERE w.watchlist_id IN (
    SELECT DISTINCT ON (user_id) watchlist_id
    FROM trading.watchlist
    ORDER BY user_id, created_ts ASC
)
AND NOT EXISTS (
    SELECT 1 FROM trading.watchlist d
    WHERE d.user_id = w.user_id AND d.is_default = TRUE
);

-- One default watchlist per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_watchlist_user_default
    ON trading.watchlist(user_id)
    WHERE is_default = TRUE;

-- Unique (case-insensitive) watchlist name per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_watchlist_user_name_lower
    ON trading.watchlist(user_id, LOWER(watchlist_name));

-- Fast membership + poller lookups.
CREATE INDEX IF NOT EXISTS idx_watchlist_inst_inst_id
    ON trading.watchlist_inst(inst_id);

COMMIT;
