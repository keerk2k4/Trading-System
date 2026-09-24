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

  /** bcrypt cost factor for refresh-token hashes. */
  private readonly BCRYPT_COST = 10;

  /**
   * Hash a refresh token using bcrypt (salted, non-deterministic).
   * Only the hash is ever persisted: read access to the database must not
   * equal session takeover, so the plaintext token is never stored.
   *
   * NOTE: because bcrypt hashes are salted, `hash(token)` returns a different
   * string every call and MUST NOT be used in a `WHERE token_hash = $1`
   * lookup. Instead, rows are located with `findRefreshTokenRow`, which loads
   * candidate rows and uses `bcrypt.compare` against each stored hash.
   * @param token - The plaintext refresh token
   * @returns The bcrypt hash to store
   */
  async hashRefreshToken(token: string): Promise<string> {
    return bcrypt.hash(token, this.BCRYPT_COST);
  }

  /**
   * Find the stored row matching a presented plaintext refresh token.
   * Compares the token against each stored bcrypt hash. Revoked and expired
   * rows are included so callers can distinguish "unknown token" from
   * "already exchanged (reuse)" and "expired".
   * @param token - The plaintext refresh token as presented by the client
   * @returns The matching row, or null if no stored hash matches
   */
  private async findRefreshTokenRow(token: string): Promise<any | null> {
    const result = await this.databaseService.query(
      `SELECT id, user_id, token_hash, is_revoked, expires_at
        FROM auth.refresh_tokens`
    );

    for (const row of result.rows) {
      if (await bcrypt.compare(token, row.token_hash)) {
        return row;
      }
    }

    return null;
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
   * Revoke the presented refresh token by marking its matched row as revoked.
   * The row is located via bcrypt.compare (see findRefreshTokenRow) and then
   * revoked by primary key, since a freshly computed bcrypt hash would never
   * equal the stored one.
   * @param token - The plaintext refresh token as presented by the client
   * @returns Number of rows updated (1 on first exchange, 0 if unknown/already revoked)
   */
  async revokeRefreshToken(token: string): Promise<number> {
    const row = await this.findRefreshTokenRow(token);

    if (!row || row.is_revoked) {
      return 0;
    }

    const result = await this.databaseService.query(
      "UPDATE auth.refresh_tokens SET is_revoked = TRUE WHERE id = $1",
      [row.id]
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
   * Validate a presented refresh token by matching it against the stored
   * bcrypt hashes, then checking it isn't revoked or expired.
   * @param token - The plaintext refresh token as presented by the client
   * @returns Object with valid flag and userId if valid
   */
  async validateRefreshToken(
    token: string,
  ): Promise<{ valid: boolean; userId?: string; error?: string }> {
    try {
      const tokenRecord = await this.findRefreshTokenRow(token);

      if (!tokenRecord) {
        return { valid: false, error: "Refresh token not found" };
      }

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
