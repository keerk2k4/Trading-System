// KYC models and interfaces.
// KycStatus comes from contracts/auth-api.yaml (src/generated/auth-client);
// KycSubmission is the UI's view model, mapped from the contract's
// KycResponse in MockKycService.
import type { KycStatus as ContractKycStatus } from '../../../generated/auth-client';

export type KycStatus = ContractKycStatus;

export interface KycSubmission {
  id?: string;
  userId: string;
  dateOfBirth: string;
  documentType: string;
  documentNumber: string;
  status: KycStatus;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface KycRequest {
  dateOfBirth: string;
  documentType: string;
  documentNumber: string;
}

export interface KycReviewRequest {
  kycId: string;
  status: 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}
