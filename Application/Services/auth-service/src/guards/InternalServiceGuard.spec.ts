import { UnauthorizedException } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { TokenService } from "../services/TokenService";
import { InternalServiceGuard } from "./InternalServiceGuard";

function contextWith(authorization?: string): any {
  const request = { headers: authorization === undefined ? {} : { authorization } };
  return { switchToHttp: () => ({ getRequest: () => request }) };
}

describe("InternalServiceGuard", () => {
  const SECRET = "internal-guard-test-secret-min-32-chars";
  let guard: InternalServiceGuard;
  let tokenService: TokenService;

  const sign = (payload: object, secret = SECRET, options: jwt.SignOptions = {}) =>
    jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: 60, ...options });
  const orderServiceToken = (overrides: object = {}, secret = SECRET) =>
    sign({ service: "order-service", scope: "auth-internal", iss: "order-service", ...overrides }, secret);

  const rejects = (authorization?: string) => {
    expect(() => guard.canActivate(contextWith(authorization))).toThrow(UnauthorizedException);
  };

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
    process.env.JWT_ISSUER = "auth-service";
  });

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    tokenService = new TokenService();
    guard = new InternalServiceGuard(tokenService);
  });

  afterEach(() => jest.restoreAllMocks());

  it("lets an order-service internal token through", () => {
    expect(guard.canActivate(contextWith(`Bearer ${orderServiceToken()}`))).toBe(true);
  });

  it("rejects a missing or malformed header", () => {
    rejects(undefined);
    rejects("");
    rejects(orderServiceToken());
  });

  it("rejects a customer access token", () => {
    rejects(`Bearer ${tokenService.createAccessToken("8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f", 6, ["CUSTOMER"])}`);
  });

  it("rejects the token auth-service mints for the Trade API", () => {
    rejects(`Bearer ${tokenService.createInternalAccessToken()}`);
  });

  it("rejects the wrong scope, service, issuer or secret", () => {
    rejects(`Bearer ${orderServiceToken({ scope: "trade-internal" })}`);
    rejects(`Bearer ${orderServiceToken({ service: "watchlist-service" })}`);
    rejects(`Bearer ${orderServiceToken({ iss: "auth-service" })}`);
    rejects(`Bearer ${orderServiceToken({}, "a-completely-different-secret-key")}`);
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign(
      { service: "order-service", scope: "auth-internal", iss: "order-service", exp: Math.floor(Date.now() / 1000) - 5 },
      SECRET,
      { algorithm: "HS256" },
    );
    rejects(`Bearer ${expired}`);
  });
});
