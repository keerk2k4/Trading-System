-- migrations/006_create_refresh_tokens.sql
-- Creates refresh token storage table for auth service.
-- Refresh tokens are opaque, stored server-side, revocable, and rotated on every use.
--
-- token_hash: bcrypt/argon2 hash of the refresh token (never store plaintext)
-- is_revoked: tracks if token has been consumed or revoked
-- created_at: when token was issued
-- expires_at: when token expires (7 days from issuance)
--
-- One active (non-revoked) refresh token per user at a time.
-- When a new token is issued, the old one is marked revoked.

BEGIN;

CREATE TABLE refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    
    user_id UUID NOT NULL,
    
    token_hash VARCHAR NOT NULL UNIQUE,
    
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    expires_at TIMESTAMP NOT NULL,
    
    CONSTRAINT chk_refresh_token_expiry
        CHECK (expires_at > created_at)
);

CREATE INDEX idx_refresh_tokens_user_id
    ON refresh_tokens(user_id);

CREATE INDEX idx_refresh_tokens_token_hash
    ON refresh_tokens(token_hash);

CREATE INDEX idx_refresh_tokens_expires_at
    ON refresh_tokens(expires_at);

COMMIT;
