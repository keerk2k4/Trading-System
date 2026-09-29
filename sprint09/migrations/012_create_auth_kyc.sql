-- migrations/012_create_auth_kyc.sql
-- Adds KYC records in auth schema. KYC is submitted by users and reviewed by admins.

BEGIN;

CREATE TABLE IF NOT EXISTS auth.kyc (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    date_of_birth DATE NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    document_number VARCHAR(100) NOT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    reviewed_by UUID NULL,
    rejection_reason TEXT NULL,

    CONSTRAINT fk_kyc_user
        FOREIGN KEY (user_id)
        REFERENCES auth.users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_kyc_reviewed_by
        FOREIGN KEY (reviewed_by)
        REFERENCES auth.users(user_id)
        ON DELETE SET NULL,

    CONSTRAINT chk_kyc_status
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),

    CONSTRAINT chk_kyc_rejection_reason
        CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_kyc_status ON auth.kyc(status);
CREATE INDEX IF NOT EXISTS idx_kyc_submitted_at ON auth.kyc(submitted_at);

COMMIT;
