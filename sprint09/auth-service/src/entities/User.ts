export interface User {
  userId: string; // UUID
  userName: string;
  passwordHash: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  status: string; // PENDING (awaiting KYC), ACTIVE, BLOCKED, DEACTIVATED
}
