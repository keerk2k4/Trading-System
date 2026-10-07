-- migrations/021_instruments_quoted_in_usd.sql
-- Migration 004 added instruments.quotation_currency with DEFAULT 'INR', and
-- no seed sets it, so every instrument read as INR. All eight are US
-- equities: Fauxnance quotes them in USD and account balances are USD. The
-- Portfolio and P&L module totals holdings in USD only and leaves a holding
-- in any other currency out of the totals, so with INR every holding was
-- left out and the portfolio read as zero.
--
-- New instruments default to USD from here on. Idempotent.

BEGIN;

ALTER TABLE trading.instruments ALTER COLUMN quotation_currency SET DEFAULT 'USD';

UPDATE trading.instruments
SET quotation_currency = 'USD'
WHERE quotation_currency = 'INR'
  AND symbol IN ('AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX');

COMMIT;
