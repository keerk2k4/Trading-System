-- migrations/013_create_auth_user_roles.sql
-- Stores authorization roles for auth users.

BEGIN;

CREATE TABLE IF NOT EXISTS auth.user_roles (
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role),

    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id)
        REFERENCES auth.users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_user_roles_role
        CHECK (role IN ('CUSTOMER', 'ADMIN'))
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON auth.user_roles(role);

COMMIT;
