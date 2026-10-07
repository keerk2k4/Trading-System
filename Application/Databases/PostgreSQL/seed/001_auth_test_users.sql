-- seed/001_auth_test_users.sql
-- Seed test users for auth service testing
-- These UUIDs are fixed for reproducible testing
-- Users are inserted into trading.users (primary), then copied to auth.users

BEGIN;

INSERT INTO trading.users (user_id, user_name, password_hash, email, phone, first_name, last_name, status)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    'alice_trader',
    '$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H1',
    'alice@example.com',
    '+353871000001',
    'Alice',
    'Trader',
    'ACTIVE'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    'bob_investor',
    '$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H2',
    'bob@example.com',
    '+353871000002',
    'Bob',
    'Investor',
    'ACTIVE'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    'charlie_trader',
    '$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H3',
    'charlie@example.com',
    '+353871000003',
    'Charlie',
    'Trader',
    'ACTIVE'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440004'::uuid,
    'diana_investor',
    '$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H4',
    'diana@example.com',
    '+353871000004',
    'Diana',
    'Investor',
    'ACTIVE'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440005'::uuid,
    'ethan_trader',
    '$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H5',
    'ethan@example.com',
    '+353871000005',
    'Ethan',
    'Trader',
    'ACTIVE'
  );

-- Copy users from trading schema to auth schema. Columns are listed
-- explicitly: auth.users has extra columns (phone_lookup_hash, migration
-- 018), so a positional SELECT * would break as soon as the order differs.
--
-- These rows are written by SQL, not by auth-service, so email and phone
-- stay plaintext and phone_lookup_hash stays NULL (the service's
-- FieldEncryptionService reads plaintext unchanged). Every user created
-- through the API is stored encrypted with a lookup hash.
INSERT INTO auth.users (user_id, user_name, password_hash, email, phone, first_name, last_name, status)
SELECT user_id, user_name, password_hash, email, phone, first_name, last_name, status
FROM trading.users;

COMMIT;
