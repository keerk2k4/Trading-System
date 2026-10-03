export * from './auth.service';
import { AuthService } from './auth.service';
export * from './kyc.service';
import { KYCService } from './kyc.service';
export * from './profile.service';
import { ProfileService } from './profile.service';
export const APIS = [AuthService, KYCService, ProfileService];
