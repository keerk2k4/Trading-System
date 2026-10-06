// Auth models and interfaces.
// Wire types are aliases of the models generated from contracts/auth-api.yaml
// (src/generated/auth-client); the rest are UI-only shapes.
import type { MessageResponse, SendOtpResponse, UserResponse, VerifyOtpResponse } from '../../../generated/auth-client';

export interface User {
  id: string;
  username: string;
  accountId: number;
  roles: string[];
}

// Matches the real POST /auth/login and POST /auth/refresh response exactly.
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface AuthResponse extends TokenResponse {
  user: User;
}

// Exactly what POST /auth/register accepts. The confirm-password field is a
// frontend-only check and is never part of this request.
export interface RegisterRequest {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  // From POST /auth/register/otp/verify; the backend refuses registration without it.
  emailVerificationToken: string;
}

// POST /auth/register/otp and POST /auth/register/otp/verify responses.
export type SendOtpResponseData = SendOtpResponse;
export type VerifyOtpResponseData = VerifyOtpResponse;

// POST /auth/reset-password response.
export type MessageResponseData = MessageResponse;

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

// What MockAuthService throws for a failed request: the server's
// { errorCode, message } body plus the HTTP status, because a request that
// never reached the backend (status 0) has no such body.
export interface AuthError extends ErrorResponse {
  status: number;
}
