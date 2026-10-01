// Auth models and interfaces.
// Wire types are aliases of the models generated from contracts/auth-api.yaml
// (src/generated/auth-client); the rest are UI-only shapes.
import type { UserResponse } from '../../../generated/auth-client';

export interface User {
  id: string;
  username: string;
  accountId: number;
  roles: string[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

// POST /auth/register response. accountId is absent at registration - the
// trading account is provisioned asynchronously afterwards.
export type UserResponseData = UserResponse;

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenPayload {
  sub: string;
  accountId: number;
  roles: string[];
  iat: number;
  exp: number;
  iss: string;
}

export interface ErrorResponse {
  errorCode: string;
  message: string;
}
