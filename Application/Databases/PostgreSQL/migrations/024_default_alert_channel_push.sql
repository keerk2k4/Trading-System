-- migrations/024_default_alert_channel_push.sql
-- The default alert channel becomes PUSH ("In app only"); email is opt-in.
--
-- Every notification is stored and shown in the app whatever the channel, so
-- PUSH loses nothing. EMAIL ("In app and email") now really emails the
-- customer, so it is something they choose rather than get by default.
-- PreferenceService applies the same default when no row exists.
--
-- Existing rows are left alone: a stored channel is the customer's choice.

BEGIN;

ALTER TABLE IF EXISTS trading.customer_preferences
    ALTER COLUMN alert_channel SET DEFAULT 'PUSH';

COMMIT;
