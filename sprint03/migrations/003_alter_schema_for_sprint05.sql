BEGIN;

ALTER TABLE trading_accounts
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE trading_accounts
    ADD CONSTRAINT chk_trading_account_version
        CHECK (version >= 0);

ALTER TABLE trading_accounts
    ALTER COLUMN available_balance TYPE NUMERIC(19, 2)
        USING ROUND(available_balance, 2),
    ALTER COLUMN blocked_balance TYPE NUMERIC(19, 2)
        USING ROUND(blocked_balance, 2);


ALTER TABLE instruments
    ALTER COLUMN status SET DEFAULT 'ACTIVE';

ALTER TABLE orders
    ALTER COLUMN limit_price TYPE NUMERIC(19, 2)
        USING CASE
            WHEN limit_price IS NULL THEN NULL
            ELSE ROUND(limit_price, 2)
        END,
    ALTER COLUMN stop_price TYPE NUMERIC(19, 2)
        USING CASE
            WHEN stop_price IS NULL THEN NULL
            ELSE ROUND(stop_price, 2)
        END;

ALTER TABLE executions
    ALTER COLUMN execution_price TYPE NUMERIC(19, 2)
        USING ROUND(execution_price, 2);

ALTER TABLE positions
    ALTER COLUMN average_price TYPE NUMERIC(19, 2)
        USING ROUND(average_price, 2),
    ALTER COLUMN realized_pnl TYPE NUMERIC(19, 2)
        USING ROUND(realized_pnl, 2);

ALTER TABLE holdings
    ALTER COLUMN average_price TYPE NUMERIC(19, 2)
        USING ROUND(average_price, 2);

ALTER TABLE account_transactions
    ALTER COLUMN amount TYPE NUMERIC(19, 2)
        USING ROUND(amount, 2);



-- The following rules intentionally remain in the Java domain:
--
-- 1. Account.debit(amount)
--    - refuses the debit if balance < amount
--    - must refuse BEFORE changing the balance
--
-- 2. Account.credit(amount)
--    - is the other permitted balance-changing operation
--
-- 3. Account.canAfford(amount)
--    - reports whether the current cash balance is sufficient
--
-- 4. Position.buy(quantity, price)
--    - recalculates weighted average cost
--
-- 5. Position.sell(quantity)
--    - refuses a sell greater than the current quantity
--    - decreases quantity
--    - leaves average cost unchanged
--
-- 6. Order.transitionTo(newStatus)
--    - owns the state-transition rules
--    - refuses disallowed transitions
--    - allows exactly one terminal state
--
-- 7. Instrument
--    - mayTrade() returns false when status = DELISTED
--    - delisting does not delete the instrument row
--
-- Database CHECK constraints protect stored invariants,
-- while business state-transition behaviour belongs to the domain.


COMMIT;