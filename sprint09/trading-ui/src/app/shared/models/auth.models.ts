// Auth models and interfaces

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
  password: string;
  confirmPassword: string;
}

// Matches the real POST /auth/register response exactly: no accountId and
// no createdOn come back - the trading account is provisioned asynchronously
// after registration, not returned in this response.
export interface UserResponseData {
  id: string;
  username: string;
  roles: string[];
}

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
