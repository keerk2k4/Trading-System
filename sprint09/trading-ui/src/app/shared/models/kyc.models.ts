// KYC models and interfaces

export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

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
