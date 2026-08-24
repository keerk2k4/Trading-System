-- migrations/003_add_trade_type.sql
-- Adds trade_type to ORDERS so the system can distinguish
-- intraday trades (settle same day, land in POSITIONS) from
-- delivery trades (settle into long-term ownership, land in HOLDINGS).
--
-- INTRADAY = same-day square-off (e.g. MIS-style trading)
-- DELIVERY = carried forward as owned shares (e.g. CNC-style trading)
--
-- Defaulting existing/unspecified rows to DELIVERY is a safe choice: it
-- is the more conservative behavior (funds/shares actually held) and
-- matches how the current seed data was intended to behave.
-- ============================================================

BEGIN;

ALTER TABLE orders
    ADD COLUMN trade_type VARCHAR(20) NOT NULL DEFAULT 'DELIVERY';

ALTER TABLE orders
    ADD CONSTRAINT chk_order_trade_type
        CHECK (trade_type IN ('INTRADAY', 'DELIVERY'));

COMMIT;
