import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { DatabaseService } from "../database/database.service";
import { RefreshTokenRepository, RefreshTokenRow } from "../repositories/RefreshTokenRepository";
import { TokenService } from "./TokenService";

@Injectable()
export class RefreshTokenService {
  private refreshTokenRepository: RefreshTokenRepository;

  constructor(
    private databaseService: DatabaseService,
    private tokenService: TokenService,
  ) {
    this.refreshTokenRepository = new RefreshTokenRepository(this.databaseService);
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  private readonly BCRYPT_COST = 10;

  async hashRefreshToken(token: string): Promise<string> {
    return bcrypt.hash(token, this.BCRYPT_COST);
  }

  /**
   * Create a deterministic lookup hash for fast indexed token queries.
   * Uses HMAC-SHA256 (not for security, only for indexing).
   */
  private createLookupHash(token: string): string {
    const secret = process.env.TOKEN_LOOKUP_SECRET || 'default-lookup-secret-change-in-prod';
    return crypto.createHmac('sha256', secret).update(token).digest('hex');
  }

  private async findRefreshTokenRow(token: string): Promise<RefreshTokenRow | null> {
    return this.refreshTokenRepository.findByPlainToken(token);
  }

  async storeRefreshToken(userId: string, tokenHash: string, plainToken: string): Promise<{ id: number; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.tokenService.getRefreshTokenExpiry() * 1000);
    const lookupHash = this.createLookupHash(plainToken);
    const result = await this.refreshTokenRepository.create(userId, tokenHash, lookupHash, expiresAt);

    return { id: result.id, expiresAt: result.expires_at };
  }

  async revokeRefreshToken(token: string): Promise<number> {
    const row = await this.findRefreshTokenRow(token);

    if (!row || row.is_revoked) {
      return 0;
    }

    return this.refreshTokenRepository.revokeById(row.id);
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<number> {
    return this.refreshTokenRepository.revokeAllByUserId(userId);
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

  /**
   * Get the active token hash for a user (used for token rotation).
   * A user can have multiple tokens, but we track the latest active one.
   */
  async getActiveRefreshTokenForUser(userId: string): Promise<string | null> {
    return this.refreshTokenRepository.findActiveTokenHashByUserId(userId);
  }
}
