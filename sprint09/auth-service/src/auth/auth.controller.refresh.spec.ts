import { Test, TestingModule } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import { AuthController } from "./auth.controller";
import { TokenService } from "../services/TokenService";
import { RefreshTokenService } from "../services/RefreshTokenService";
import { PasswordService } from "../services/PasswordService";
import { TradeApiClient } from "../services/TradeApiClient";
import { UserRepository } from "../repositories/UserRepository";
import { ThrottleService } from "../services/ThrottleService";
import { DatabaseService } from "../database/database.service";
import { AccountProvisioningEventService } from "../services/AccountProvisioningEventService";
import { NotificationService } from "../services/NotificationService";

const SECRET = "refresh-rotation-test-secret-min32";
const USER_ID = "11111111-2222-4333-8444-555555555555";

/** In-memory stand-in for the auth.refresh_tokens table. */
function makeFakeDatabaseService() {
  const rows: Array<{
    id: number;
    user_id: string;
    token_hash: string;
    lookup_hash?: string;
    is_revoked: boolean;
    created_at: Date;
    expires_at: Date;
  }> = [];
  let nextId = 1;

  return {
    rows,
    async query(text: string, params: any[] = []) {
      if (text.includes("INSERT INTO auth.refresh_tokens")) {
        // New signature: userId, tokenHash, lookupHash, expiresAt
        // Old signature: userId, tokenHash, expiresAt (from legacy tests)
        const [userId, tokenHash, thirdParam, fourthParam] = params;
        
        // Determine if this is the new signature (with lookup_hash) or old
        const hasLookupHash = params.length === 4;
        const lookupHash = hasLookupHash ? thirdParam : undefined;
        const expiresAt = hasLookupHash ? fourthParam : thirdParam;
        
        const row = {
          id: nextId++,
          user_id: userId,
          token_hash: tokenHash,
          lookup_hash: lookupHash,
          is_revoked: false,
          created_at: new Date(),
          expires_at: new Date(expiresAt),
        };
        rows.push(row);
        return { rows: [{ id: row.id, expires_at: row.expires_at }], rowCount: 1 };
      }
      if (text.includes("WHERE lookup_hash")) {
        // New query with lookup_hash WHERE clause
        const [lookupHash] = params;
        const matches = rows.filter(
          r => r.lookup_hash === lookupHash && !r.is_revoked && new Date(r.expires_at) > new Date()
        );
        return { rows: matches, rowCount: matches.length };
      }
      if (text.includes("SELECT id, user_id, token_hash, is_revoked, expires_at")) {
        // Legacy query without WHERE lookup_hash (for backward compatibility)
        // bcrypt hashes are salted: matching is done by the service via
        // bcrypt.compare, so the fake returns every candidate row.
        return { rows: [...rows], rowCount: rows.length };
      }
      if (text.includes("UPDATE auth.refresh_tokens SET is_revoked = TRUE WHERE id")) {
        const [id] = params;
        let n = 0;
        for (const r of rows) {
          if (r.id === id && !r.is_revoked) {
            r.is_revoked = true;
            n++;
          }
        }
        return { rowCount: n, rows: [] };
      }
      throw new Error(`Unhandled query in fake DB: ${text}`);
    },
  };
}

function mockRes() {
  const state: { status?: number; body?: any } = {};
  const res: any = {
    status: (code: number) => ({
      json: (body: any) => {
        state.status = code;
        state.body = body;
        return res;
      },
    }),
  };
  return { res, state };
}

describe("Auth refresh rotation", () => {
  let controller: AuthController;
  let refreshService: RefreshTokenService;
  let fakeDb: ReturnType<typeof makeFakeDatabaseService>;

  const fakeUser: any = {
    userId: USER_ID,
    userName: "rotation_user",
    passwordHash: "hash",
    email: "rotation_user@placeholder.local",
    phone: null,
    firstName: "",
    lastName: "",
    status: "ACTIVE",
  };

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
    process.env.JWT_ISSUER = "auth-service";
    process.env.JWT_ACCESS_TOKEN_EXPIRY_SECONDS = "900";
    process.env.JWT_REFRESH_TOKEN_EXPIRY_SECONDS = "604800";
  });

  beforeEach(async () => {
    fakeDb = makeFakeDatabaseService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        TokenService,
        RefreshTokenService,
        PasswordService,
        ThrottleService,
        { provide: DatabaseService, useValue: fakeDb },
        {
          provide: UserRepository,
          useValue: {
            findByUserId: async () => fakeUser,
            getRoles: async () => ["CUSTOMER"],
          },
        },
        {
          provide: TradeApiClient,
          useValue: {
            getAccountByUserId: async () => ({
              accountId: 7,
              accountNumber: "ACC-7",
              availableBalance: "0",
              accountStatus: "ACTIVE",
            }),
          },
        },
        {
          provide: AccountProvisioningEventService,
          useValue: {
            publishUserRegistered: async () => undefined,
          },
        },
        {
          provide: NotificationService,
          useValue: {
            sendUserRegistered: async () => undefined,
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    refreshService = module.get<RefreshTokenService>(RefreshTokenService);
  });

  async function issueInitialRefreshToken(): Promise<string> {
    const token = refreshService.generateRefreshToken();
    const hash = await refreshService.hashRefreshToken(token);
    await refreshService.storeRefreshToken(USER_ID, hash, token);
    return token;
  }

  it("# refresh returns a new access token and a new refresh token", async () => {
    const first = await issueInitialRefreshToken();
    const { res, state } = mockRes();

    await controller.refresh({ refreshToken: first } as any, res);

    expect(state.status).toBe(200);
    expect(state.body.accessToken).toBeDefined();
    expect(state.body.refreshToken).toBeDefined();
    // Rotation: the refresh token must change on every refresh.
    expect(state.body.refreshToken).not.toBe(first);

    const decoded = jwt.verify(state.body.accessToken, SECRET, {
      algorithms: ["HS256"],
      issuer: "auth-service",
    }) as any;
    expect(decoded.sub).toBe(USER_ID);
    expect(decoded.accountId).toBe(7);
  });

  it("# the newly issued refresh token works", async () => {
    const first = await issueInitialRefreshToken();
    const firstCall = mockRes();
    await controller.refresh({ refreshToken: first } as any, firstCall.res);
    expect(firstCall.state.status).toBe(200);

    const second = firstCall.state.body.refreshToken;
    const secondCall = mockRes();
    await controller.refresh({ refreshToken: second } as any, secondCall.res);

    expect(secondCall.state.status).toBe(200);
    expect(secondCall.state.body.accessToken).toBeDefined();
    expect(secondCall.state.body.refreshToken).toBeDefined();
    expect(secondCall.state.body.refreshToken).not.toBe(second);
  });

  it("# only a bcrypt hash of the refresh token is stored, never the token", async () => {
    const token = await issueInitialRefreshToken();

    expect(fakeDb.rows.length).toBe(1);
    const stored = fakeDb.rows[0].token_hash;
    // bcrypt format, not the plaintext token.
    expect(stored).toMatch(/^\$2[aby]\$/);
    expect(stored).not.toContain(token);
    // Salted: hashing the same token again gives a different string,
    // which is why lookup uses bcrypt.compare instead of WHERE token_hash = $1.
    const secondHash = await refreshService.hashRefreshToken(token);
    expect(secondHash).not.toBe(stored);
  });

  it("# the declared revocation behaviour holds: an exchanged token is refused on replay", async () => {
    const first = await issueInitialRefreshToken();
    const firstCall = mockRes();
    await controller.refresh({ refreshToken: first } as any, firstCall.res);
    expect(firstCall.state.status).toBe(200);

    // The presented token was revoked during rotation, so replaying it is theft/reuse.
    const replay = mockRes();
    await controller.refresh({ refreshToken: first } as any, replay.res);

    expect(replay.state.status).toBe(401);
    expect(replay.state.body.errorCode).toBe("AUTH-401");
  });
});
