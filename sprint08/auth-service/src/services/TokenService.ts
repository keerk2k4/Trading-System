import { Injectable } from "@nestjs/common";
import * as jwt from "jsonwebtoken";

interface TokenPayload {
  sub: string; // UUID user identifier
  accountId: number;
  roles: string[];
  iat: number;
  exp: number;
  iss: string;
}

interface VerifyResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
}

@Injectable()
export class TokenService {
  private readonly SECRET = process.env.JWT_SECRET!;
  private readonly ISSUER = process.env.JWT_ISSUER || "auth-service";
  private readonly ACCESS_TOKEN_EXPIRY = parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRY_SECONDS || "900", 10); // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY = parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRY_SECONDS || "604800", 10); // 7 days

  /**
   * Create an access token with the specified claims.
   * @param sub - User UUID identifier
   * @param accountId - Trading account ID
   * @param roles - Array of roles (e.g., ["CUSTOMER"])
   * @returns Signed JWT token
   */
  createAccessToken(sub: string, accountId: number, roles: string[]): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      sub,
      accountId,
      roles,
      iat: now,
      exp: now + this.ACCESS_TOKEN_EXPIRY,
      iss: this.ISSUER,
    };

    return jwt.sign(payload, this.SECRET, { algorithm: "HS256" });
  }

  /**
   * Verify an access token and return its payload.
   * Validates signature, expiry, and issuer.
   * @param token - The JWT token to verify
   * @returns Object with valid flag and payload (if valid) or error (if invalid)
   */
  verifyAccessToken(token: string): VerifyResult {
    try {
      const payload = jwt.verify(token, this.SECRET, {
        algorithms: ["HS256"],
        issuer: this.ISSUER,
      }) as TokenPayload;

      return { valid: true, payload };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Decode a token without verification (unsafe, for inspection only).
   * @param token - The JWT token to decode
   * @returns Decoded payload or null if invalid
   */
  decodeToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.decode(token) as TokenPayload | null;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Get the access token expiry time in seconds.
   * @returns Expiry time in seconds
   */
  getAccessTokenExpiry(): number {
    return this.ACCESS_TOKEN_EXPIRY;
  }

  /**
   * Get the refresh token expiry time in seconds.
   * @returns Expiry time in seconds
   */
  getRefreshTokenExpiry(): number {
    return this.REFRESH_TOKEN_EXPIRY;
  }
}
