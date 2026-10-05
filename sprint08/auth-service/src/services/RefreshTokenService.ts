import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { DatabaseService } from "../database/database.service";
import { TokenService } from "./TokenService";

@Injectable()
export class RefreshTokenService {
  constructor(
    private databaseService: DatabaseService,
    private tokenService: TokenService,
  ) {}

  /**
   * Generate a new refresh token (opaque random string).
   * @returns Random token string (64 hex characters)
   */
  generateRefreshToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Hash a refresh token using bcryptjs.
   * Never store plaintext refresh tokens in the database.
   * @param token - The plaintext refresh token
   * @returns The hashed token
   */
  async hashRefreshToken(token: string): Promise<string> {
    return bcrypt.hash(token, 12);
  }

  /**
   * Store a refresh token in the database.
   * @param userId - The user UUID
   * @param tokenHash - The hashed refresh token
   * @returns The stored token record
   */
  async storeRefreshToken(userId: string, tokenHash: string): Promise<{ id: number; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.tokenService.getRefreshTokenExpiry() * 1000);

    const result = await this.databaseService.query(
      `INSERT INTO auth.refresh_tokens (user_id, token_hash, is_revoked, created_at, expires_at)
       VALUES ($1, $2, FALSE, CURRENT_TIMESTAMP, $3)
       RETURNING id, expires_at`,
      [userId, tokenHash, expiresAt]
    );

    return result.rows[0];
  }

  /**
   * Revoke a refresh token by marking it as revoked.
   * @param tokenHash - The hashed refresh token to revoke
   * @returns Number of rows updated
   */
  async revokeRefreshToken(tokenHash: string): Promise<number> {
    const result = await this.databaseService.query(
      "UPDATE auth.refresh_tokens SET is_revoked = TRUE WHERE token_hash = $1",
      [tokenHash]
    );
    return result.rowCount || 0;
  }

  /**
   * Revoke all refresh tokens for a user.
   * Used when theft is detected (token presented twice).
   * @param userId - The user UUID
   * @returns Number of rows updated
   */
  async revokeAllRefreshTokensForUser(userId: string): Promise<number> {
    const result = await this.databaseService.query(
      "UPDATE auth.refresh_tokens SET is_revoked = TRUE WHERE user_id = $1",
      [userId]
    );
    return result.rowCount || 0;
  }

  /**
   * Validate a refresh token by looking it up and checking it exists and isn't revoked.
   * @param token - The plaintext refresh token
   * @param tokenHash - The hashed refresh token (pre-computed)
   * @returns Object with valid flag and userId if valid
   */
  async validateRefreshToken(
    token: string,
    tokenHash?: string,
  ): Promise<{ valid: boolean; userId?: string; error?: string }> {
    try {
      // If hash not provided, hash the token
      const hash = tokenHash || (await this.hashRefreshToken(token));

      const result = await this.databaseService.query(
        `SELECT id, user_id, is_revoked, expires_at 
         FROM auth.refresh_tokens 
         WHERE token_hash = $1`,
        [hash]
      );

      if (result.rows.length === 0) {
        return { valid: false, error: "Refresh token not found" };
      }

      const tokenRecord = result.rows[0];

      // Check if token is revoked
      if (tokenRecord.is_revoked) {
        // Token was revoked - indicates theft
        return { valid: false, error: "Token already used (theft detected)" };
      }

      // Check if token has expired
      if (new Date() > new Date(tokenRecord.expires_at)) {
        return { valid: false, error: "Refresh token expired" };
      }

      return { valid: true, userId: tokenRecord.user_id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Get the most recent refresh token hash for a user.
   * Used to identify which token to revoke during rotation.
   * @param userId - The user UUID
   * @returns The token hash or null if no active token
   */
  async getActiveRefreshTokenForUser(userId: string): Promise<string | null> {
    const result = await this.databaseService.query(
      `SELECT token_hash FROM auth.refresh_tokens 
       WHERE user_id = $1 AND is_revoked = FALSE AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    return result.rows.length > 0 ? result.rows[0].token_hash : null;
  }
}
