-- migrations/016_fix_watchlist_user_fk.sql
-- Watchlist ownership must follow the auth-service source of truth.
--
-- Migration 008 pointed trading.watchlist.user_id -> trading.users(user_id),
-- but new users are created only in auth.users (see UserRepository.create and
-- UserMapper.findUserById). Seed users exist in both tables, so seeds pass,
-- while real registrations fail with:
--   FK "fk_watchlist_user": Key (user_id)=... is not present in table "users".
-- That failure ran inside WatchlistService.ensureDefaultWatchlist, marked the
-- surrounding account-creation transaction rollback-only, and rolled back the
-- just-inserted trading_accounts row -> login 401 "missing trading account"
-- with Kafka retries exhausted.
--
-- Repoint the FK to auth.users(user_id). Types already match (UUID).

BEGIN;

ALTER TABLE trading.watchlist
    DROP CONSTRAINT IF EXISTS fk_watchlist_user;

ALTER TABLE trading.watchlist
    ADD CONSTRAINT fk_watchlist_user
    FOREIGN KEY (user_id)
    REFERENCES auth.users(user_id)
    ON DELETE CASCADE;

COMMIT;
