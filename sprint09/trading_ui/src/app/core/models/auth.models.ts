/**
 * Hand-written interim types mirroring contracts/auth-api.yaml.
 *
 * These exist ONLY because the real generated client (see the sprint
 * README's client-generation section) could not be produced from this
 * environment — the OpenAPI Generator runs on the JVM and downloads its jar
 * from Maven Central, which this sandbox's network policy blocks.
 *
 * These are a stand-in, not the deliverable. The "Typed Clients Generated
 * from the Contracts" story is NOT satisfied by this file — replace every
 * import of this file with the generated equivalent once you've run
 * `npm run generate:api`, and delete this file.
 */

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface UserResponse {
  id: string;
  username: string;
  accountId: number;
  roles: Array<'CUSTOMER' | 'ADMIN'>;
}

export interface ErrorResponse {
  errorCode: string;
  message: string;
}

export type KycDocumentType = 'PASSPORT' | 'DRIVERS_LICENSE' | 'NATIONAL_ID';

export interface CreateKycRequest {
  dateOfBirth: string; // ISO date, e.g. 1996-02-14
  documentType: string;
  documentNumber: string;
}

export interface KycResponse {
  id: number;
  userId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  dateOfBirth: string;
  documentType: string;
  documentNumber: string;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
  accountId?: number;
}
