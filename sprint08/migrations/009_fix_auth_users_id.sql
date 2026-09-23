-- auth.users lost its PRIMARY KEY and any default value generation when it
-- was created via "CREATE TABLE ... AS TABLE ... WITH NO DATA" in migration
-- 008 -- that syntax only copies column names and types, not constraints
-- or defaults. Without this fix, every new row's user_id is genuinely NULL.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE auth.users
    ALTER COLUMN user_id SET DEFAULT gen_random_uuid();

ALTER TABLE auth.users
    ADD CONSTRAINT auth_users_pkey PRIMARY KEY (user_id);

COMMIT;