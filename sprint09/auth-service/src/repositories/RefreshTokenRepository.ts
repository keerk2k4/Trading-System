import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { DatabaseService } from "../database/database.service";

export type RefreshTokenRow = {
  id: number;
  user_id: string;
  token_hash: string;
  lookup_hash?: string;
  is_revoked: boolean;
  expires_at: Date;
};

@Injectable()
export class RefreshTokenRepository {
  constructor(private databaseService: DatabaseService) {}

  /**
   * Create a deterministic lookup hash from a plain token.
   * Uses HMAC-SHA256 for fast, indexed lookups (not for security).
   * The actual token verification still uses bcrypt.
   */
  private createLookupHash(token: string): string {
    const secret = process.env.TOKEN_LOOKUP_SECRET || 'default-lookup-secret-change-in-prod';
    return crypto.createHmac('sha256', secret).update(token).digest('hex');
  }

  /**
   * Find refresh token by plain text token using indexed lookup.
   * This is O(1) lookup using the lookup_hash index, not O(n) full scan.
   */
  async findByPlainToken(token: string): Promise<RefreshTokenRow | null> {
    const lookupHash = this.createLookupHash(token);

    // Query with WHERE clause using indexed column (fast)
    const result = await this.databaseService.query(
      `SELECT id, user_id, token_hash, is_revoked, expires_at
       FROM auth.refresh_tokens
       WHERE lookup_hash = $1 
       AND is_revoked = FALSE 
       AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [lookupHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Final verification: verify with bcrypt only on lookup_hash match
    const isValid = await bcrypt.compare(token, row.token_hash);

    return isValid ? row : null;
  }

  /**
   * Create a new refresh token record with lookup hash for fast retrieval.
   * @param userId - User ID from auth service
   * @param tokenHash - Bcrypt hash of the token (for verification)
   * @param lookupHash - HMAC lookup hash (for indexed queries)
   * @param expiresAt - Token expiration time
   */
  async create(
    userId: string,
    tokenHash: string,
    lookupHash: string,
    expiresAt: Date
  ): Promise<{ id: number; expires_at: Date }> {
    const result = await this.databaseService.query(
      `INSERT INTO auth.refresh_tokens (user_id, token_hash, lookup_hash, is_revoked, created_at, expires_at)
       VALUES ($1, $2, $3, FALSE, CURRENT_TIMESTAMP, $4)
       RETURNING id, expires_at`,
      [userId, tokenHash, lookupHash, expiresAt]
    );

    return result.rows[0];
  }

  async revokeById(id: number): Promise<number> {
    const result = await this.databaseService.query(
      "UPDATE auth.refresh_tokens SET is_revoked = TRUE WHERE id = $1",
      [id]
    );

    return result.rowCount || 0;
  }

  async revokeAllByUserId(userId: string): Promise<number> {
    const result = await this.databaseService.query(
      "UPDATE auth.refresh_tokens SET is_revoked = TRUE WHERE user_id = $1",
      [userId]
    );

    return result.rowCount || 0;
  }

  async findActiveTokenHashByUserId(userId: string): Promise<string | null> {
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