import { DatabaseService } from "../database/database.service";
import { TokenService } from "./TokenService";
import { RefreshTokenService } from "./RefreshTokenService";

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function makeTokenRow(overrides: Partial<{
  id: number;
  user_id: string;
  token_hash: string;
  is_revoked: boolean;
  expires_at: Date;
}> = {}) {
  return {
    id: 1,
    user_id: USER_ID,
    token_hash: "unused-hash",
    is_revoked: false,
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

describe("RefreshTokenService", () => {
  let query: jest.Mock;
  let tokenService: any;
  let service: RefreshTokenService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    tokenService = {
      getRefreshTokenExpiry: jest.fn().mockReturnValue(604800),
    };
    service = new RefreshTokenService(
      { query } as unknown as DatabaseService,
      tokenService as TokenService,
    );
  });

  describe("token generation and hashing", () => {
    it("generates 64-character random hex tokens", () => {
      const first = service.generateRefreshToken();
      const second = service.generateRefreshToken();

      expect(first).toMatch(/^[a-f0-9]{64}$/);
      expect(second).toMatch(/^[a-f0-9]{64}$/);
      expect(first).not.toBe(second);
    });

    it("hashes tokens with bcrypt rather than returning the plaintext", async () => {
      const token = "plaintext-refresh-token";

      const hash = await service.hashRefreshToken(token);

      expect(hash).toMatch(/^\$2[aby]\$/);
      expect(hash).not.toBe(token);
    });
  });

  describe("storeRefreshToken", () => {
    it("stores the hash with an expiry derived from TokenService", async () => {
      const expiry = new Date("2030-01-02T03:04:05.000Z");
      query.mockResolvedValueOnce({ rows: [{ id: 9, expires_at: expiry }], rowCount: 1 });

      const result = await service.storeRefreshToken(USER_ID, "hashed-token");

      expect(tokenService.getRefreshTokenExpiry).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 9, expiresAt: expiry });
      expect(query).toHaveBeenCalledWith(
        `INSERT INTO auth.refresh_tokens (user_id, token_hash, is_revoked, created_at, expires_at)
       VALUES ($1, $2, FALSE, CURRENT_TIMESTAMP, $3)
       RETURNING id, expires_at`,
        [USER_ID, "hashed-token", expect.any(Date)],
      );
      const storedExpiry = query.mock.calls[0][1][2] as Date;
      expect(storedExpiry.getTime()).toBeGreaterThan(Date.now() + 604800 * 1000 - 5000);
    });
  });

  describe("validateRefreshToken", () => {
    it("returns an error for a token that is not stored", async () => {
      await expect(service.validateRefreshToken("unknown-token")).resolves.toEqual({
        valid: false,
        error: "Refresh token not found",
      });
    });

    it("accepts an active, non-revoked token and returns its user ID", async () => {
      const token = "active-refresh-token";
      const tokenHash = await service.hashRefreshToken(token);
      query.mockResolvedValueOnce({ rows: [makeTokenRow({ token_hash: tokenHash })], rowCount: 1 });

      await expect(service.validateRefreshToken(token)).resolves.toEqual({
        valid: true,
        userId: USER_ID,
      });
    });

    it("rejects a revoked token as a possible replay or theft", async () => {
      const token = "revoked-refresh-token";
      const tokenHash = await service.hashRefreshToken(token);
      query.mockResolvedValueOnce({
        rows: [makeTokenRow({ token_hash: tokenHash, is_revoked: true })],
        rowCount: 1,
      });

      await expect(service.validateRefreshToken(token)).resolves.toEqual({
        valid: false,
        error: "Token already used (theft detected)",
      });
    });

    it("rejects an expired token", async () => {
      const token = "expired-refresh-token";
      const tokenHash = await service.hashRefreshToken(token);
      query.mockResolvedValueOnce({
        rows: [
          makeTokenRow({
            token_hash: tokenHash,
            expires_at: new Date(Date.now() - 60_000),
          }),
        ],
        rowCount: 1,
      });

      await expect(service.validateRefreshToken(token)).resolves.toEqual({
        valid: false,
        error: "Refresh token expired",
      });
    });

    it("returns an invalid result when the lookup itself fails", async () => {
      query.mockRejectedValueOnce(new Error("refresh token store unavailable"));

      await expect(service.validateRefreshToken("refresh-token")).resolves.toEqual({
        valid: false,
        error: "refresh token store unavailable",
      });
    });
  });

  describe("revokeRefreshToken", () => {
    it("does not update when the token is not found", async () => {
      await expect(service.revokeRefreshToken("unknown-token")).resolves.toBe(0);

      expect(query).toHaveBeenCalledTimes(1);
    });

    it("does not update a token that is already revoked", async () => {
      const token = "already-revoked-token";
      const tokenHash = await service.hashRefreshToken(token);
      query.mockResolvedValueOnce({
        rows: [makeTokenRow({ id: 4, token_hash: tokenHash, is_revoked: true })],
        rowCount: 1,
      });

      await expect(service.revokeRefreshToken(token)).resolves.toBe(0);

      expect(query).toHaveBeenCalledTimes(1);
    });

    it("revokes a matching active row by its primary key", async () => {
      const token = "active-token-to-revoke";
      const tokenHash = await service.hashRefreshToken(token);
      query
        .mockResolvedValueOnce({ rows: [makeTokenRow({ id: 17, token_hash: tokenHash })], rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });

      await expect(service.revokeRefreshToken(token)).resolves.toBe(1);

      expect(query).toHaveBeenNthCalledWith(
        2,
        "UPDATE auth.refresh_tokens SET is_revoked = TRUE WHERE id = $1",
        [17],
      );
    });
  });

  describe("account-wide token operations", () => {
    it("revokes all active refresh tokens for a user", async () => {
      query.mockResolvedValueOnce({ rowCount: 3, rows: [] });

      await expect(service.revokeAllRefreshTokensForUser(USER_ID)).resolves.toBe(3);

      expect(query).toHaveBeenCalledWith(
        "UPDATE auth.refresh_tokens SET is_revoked = TRUE WHERE user_id = $1",
        [USER_ID],
      );
    });

    it("returns the newest active token hash when one exists", async () => {
      query.mockResolvedValueOnce({ rows: [{ token_hash: "active-hash" }], rowCount: 1 });

      await expect(service.getActiveRefreshTokenForUser(USER_ID)).resolves.toBe("active-hash");

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE user_id = $1 AND is_revoked = FALSE AND expires_at > CURRENT_TIMESTAMP"),
        [USER_ID],
      );
    });

    it("returns null when the user has no active refresh token", async () => {
      query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(service.getActiveRefreshTokenForUser(USER_ID)).resolves.toBeNull();
    });
  });
});
