-- trading_account_id has no auto-generating default at all -- every
-- insert must currently supply it manually, which insertAccount() never
-- does. Add a real sequence-backed default, matching standard practice
-- for a bigint primary key.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS trading.trading_accounts_id_seq
    OWNED BY trading.trading_accounts.trading_account_id;

SELECT setval('trading.trading_accounts_id_seq',
    COALESCE((SELECT MAX(trading_account_id) FROM trading.trading_accounts), 0) + 1, false);

ALTER TABLE trading.trading_accounts
    ALTER COLUMN trading_account_id SET DEFAULT nextval('trading.trading_accounts_id_seq');

COMMIT;