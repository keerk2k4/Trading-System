import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { DatabaseService } from "../database/database.service";

export type RefreshTokenRow = {
  id: number;
  user_id: string;
  token_hash: string;
  is_revoked: boolean;
  expires_at: Date;
};

@Injectable()
export class RefreshTokenRepository {
  constructor(private databaseService: DatabaseService) {}

  async findByPlainToken(token: string): Promise<RefreshTokenRow | null> {
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

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<{ id: number; expires_at: Date }> {
    const result = await this.databaseService.query(
      `INSERT INTO auth.refresh_tokens (user_id, token_hash, is_revoked, created_at, expires_at)
       VALUES ($1, $2, FALSE, CURRENT_TIMESTAMP, $3)
       RETURNING id, expires_at`,
      [userId, tokenHash, expiresAt]
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