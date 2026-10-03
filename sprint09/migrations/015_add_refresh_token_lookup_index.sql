-- Migration 015: Add lookup_hash index for fast refresh token queries
-- Purpose: Fix O(n) bcrypt loop by using indexed lookup

-- Add lookup_hash column for deterministic, indexed lookups
ALTER TABLE auth.refresh_tokens 
ADD COLUMN lookup_hash VARCHAR(255) UNIQUE;

-- Create index for O(1) lookup performance
CREATE INDEX idx_refresh_tokens_lookup_hash 
ON auth.refresh_tokens(lookup_hash);

-- Create compound index for common filter patterns
CREATE INDEX idx_refresh_tokens_user_active 
ON auth.refresh_tokens(user_id, is_revoked, expires_at DESC);

-- Revoke all existing tokens (they won't have lookup_hash populated)
-- This forces users to re-login, which generates new tokens with lookup_hash
UPDATE auth.refresh_tokens 
SET is_revoked = TRUE 
WHERE lookup_hash IS NULL;
