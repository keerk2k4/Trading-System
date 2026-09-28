export interface Kyc {
  id: number;
  userId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  dateOfBirth: string;
  documentType: string;
  documentNumber: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
}
