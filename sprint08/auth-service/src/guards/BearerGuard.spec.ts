import { UnauthorizedException } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { TokenService } from "../services/TokenService";
import { BearerGuard } from "./BearerGuard";

function mockContext(authHeader?: string): any {
  const request: any = { headers: {} as any };
  if (authHeader !== undefined) {
    request.headers.authorization = authHeader;
  }
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    __request: request,
  };
}

function mockContextWithHeaders(headers: Record<string, string>): any {
  const request: any = { headers: { ...headers } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    __request: request,
  };
}

function auth401Of(fn: () => void): any {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(UnauthorizedException);
    const res = (err as UnauthorizedException).getResponse() as any;
    expect(res.errorCode).toBe("AUTH-401");
    expect((err as UnauthorizedException).getStatus()).toBe(401);
    return res;
  }
  throw new Error("Expected UnauthorizedException with AUTH-401");
}

describe("BearerGuard", () => {
  const SECRET = "guard-test-secret-min-32-chars-xyz";
  const WRONG_SECRET = "a-completely-different-secret-key";
  const USER_ID = "8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f";

  let tokenService: TokenService;
  let guard: BearerGuard;

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
    process.env.JWT_ISSUER = "auth-service";
    process.env.JWT_ACCESS_TOKEN_EXPIRY_SECONDS = "900";
  });

  beforeEach(() => {
    tokenService = new TokenService();
    guard = new BearerGuard(tokenService);
  });

  it("# a valid token is accepted and the verified payload is attached", () => {
    const token = tokenService.createAccessToken(USER_ID, 42, ["CUSTOMER"]);
    const ctx = mockContext(`Bearer ${token}`);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(ctx.__request.user).toBeDefined();
    expect(ctx.__request.user.sub).toBe(USER_ID);
    expect(ctx.__request.user.accountId).toBe(42);
  });

  it("# bearer parsing is case-insensitive", () => {
    const token = tokenService.createAccessToken(USER_ID, 42, ["CUSTOMER"]);
    const ctx = mockContext(`bearer ${token}`);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(ctx.__request.user.sub).toBe(USER_ID);
  });

  it("# x-access-token is accepted when authorization header is absent", () => {
    const token = tokenService.createAccessToken(USER_ID, 42, ["CUSTOMER"]);
    const ctx = mockContextWithHeaders({ "x-access-token": token });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(ctx.__request.user.sub).toBe(USER_ID);
  });

  it("# accessToken cookie is accepted when headers are absent", () => {
    const token = tokenService.createAccessToken(USER_ID, 42, ["CUSTOMER"]);
    const ctx = mockContextWithHeaders({ cookie: `accessToken=${encodeURIComponent(token)}` });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(ctx.__request.user.sub).toBe(USER_ID);
  });

  it("# an expired token is refused (genuine token signed with a past expiry)", () => {
    const now = Math.floor(Date.now() / 1000);
    // Genuine token: correctly signed with the real secret, but exp is in the past.
    // (NOT built by corrupting the payload — the signature check would refuse that first.)
    const expiredToken = jwt.sign(
      {
        sub: USER_ID,
        accountId: 42,
        roles: ["CUSTOMER"],
        iat: now - 2000,
        exp: now - 10,
        iss: "auth-service",
      },
      SECRET,
      { algorithm: "HS256" },
    );

    const ctx = mockContext(`Bearer ${expiredToken}`);
    auth401Of(() => guard.canActivate(ctx));
    expect(ctx.__request.user).toBeUndefined();
  });

  it("# a token with a wrong signature is refused before any claim is read", () => {
    const now = Math.floor(Date.now() / 1000);
    // Genuine, unexpired claims — but signed with a DIFFERENT key.
    const wrongKeyToken = jwt.sign(
      {
        sub: USER_ID,
        accountId: 42,
        roles: ["CUSTOMER"],
        iat: now,
        exp: now + 900,
        iss: "auth-service",
      },
      WRONG_SECRET,
      { algorithm: "HS256" },
    );

    const ctx = mockContext(`Bearer ${wrongKeyToken}`);
    auth401Of(() => guard.canActivate(ctx));
    // Refused at the signature check, so no claims are ever attached/trusted.
    expect(ctx.__request.user).toBeUndefined();
  });

  it("# a malformed header is refused", () => {
    // No header at all
    auth401Of(() => guard.canActivate(mockContext(undefined)));
    // Wrong scheme
    auth401Of(() => guard.canActivate(mockContext("Token abc.def.ghi")));
    // Empty bearer value
    auth401Of(() => guard.canActivate(mockContext("Bearer ")));
    // Garbage that is not a JWT
    auth401Of(() => guard.canActivate(mockContext("Bearer invalid.token.here")));
  });
});
