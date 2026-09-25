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

  generateRefreshToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  private readonly BCRYPT_COST = 10;

  async hashRefreshToken(token: string): Promise<string> {
    return bcrypt.hash(token, this.BCRYPT_COST);
  }


  // Better query?
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

  async revokeAllRefreshTokensForUser(userId: string): Promise<number> {
    const result = await this.databaseService.query(
      "UPDATE auth.refresh_tokens SET is_revoked = TRUE WHERE user_id = $1",
      [userId]
    );
    return result.rowCount || 0;
  }

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

  // could have multiple refresh tokens 
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
