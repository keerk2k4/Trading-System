import { HttpException, HttpStatus } from "@nestjs/common";
import { TokenService } from "./TokenService";
import { TradeApiClient, TradeAccountResponse } from "./TradeApiClient";

function makeResponse(
  overrides: Partial<{
    ok: boolean;
    status: number;
    json: jest.Mock;
  }> = {},
): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as Response;
}

describe("TradeApiClient", () => {
  const originalFetch = global.fetch;
  const originalTradeApiUrl = process.env.TRADE_API_URL;
  let fetchMock: jest.Mock;
  let tokenService: { createInternalAccessToken: jest.Mock };
  let client: TradeApiClient;

  beforeEach(() => {
    process.env.TRADE_API_URL = "https://trade-api.test";
    fetchMock = jest.fn();
    tokenService = {
      createInternalAccessToken: jest.fn().mockReturnValue("internal-service-token"),
    };
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new TradeApiClient(tokenService as unknown as TokenService);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalTradeApiUrl === undefined) {
      delete process.env.TRADE_API_URL;
    } else {
      process.env.TRADE_API_URL = originalTradeApiUrl;
    }
  });

  describe("createAccount", () => {
    it("posts the user ID as JSON and returns the created account", async () => {
      const account: TradeAccountResponse = {
        accountId: 42,
        accountNumber: "ACC-42",
        availableBalance: "0.00",
        accountStatus: "ACTIVE",
      };
      const response = makeResponse({
        status: 201,
        json: jest.fn().mockResolvedValue(account),
      });
      fetchMock.mockResolvedValue(response);

      await expect(client.createAccount("user-123")).resolves.toEqual(account);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("https://trade-api.test/internal/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer internal-service-token",
        },
        body: JSON.stringify({ userId: "user-123" }),
      });
      expect(tokenService.createInternalAccessToken).toHaveBeenCalledTimes(1);
      expect(response.json).toHaveBeenCalledTimes(1);
    });

    it("maps an unsuccessful account response to AUTH-500", async () => {
      fetchMock.mockResolvedValue(makeResponse({ ok: false, status: 503 }));

      let thrown: unknown;
      try {
        await client.createAccount("user-123");
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(HttpException);
      expect((thrown as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect((thrown as HttpException).getResponse()).toEqual({
        errorCode: "AUTH-500",
        message: "Failed to create trading account",
      });
    });

    it("propagates a network error without manufacturing a response", async () => {
      const networkError = new Error("trade API is unreachable");
      fetchMock.mockRejectedValue(networkError);

      await expect(client.createAccount("user-123")).rejects.toBe(networkError);
    });
  });

  describe("getAccountByUserId", () => {
    it("gets the current account from the user-specific endpoint", async () => {
      const account: TradeAccountResponse = {
        accountId: 7,
        accountNumber: "ACC-7",
        availableBalance: "125.50",
        accountStatus: "ACTIVE",
      };
      const response = makeResponse({ json: jest.fn().mockResolvedValue(account) });
      fetchMock.mockResolvedValue(response);

      await expect(client.getAccountByUserId("user-123")).resolves.toEqual(account);

      expect(fetchMock).toHaveBeenCalledWith(
        "https://trade-api.test/internal/accounts/by-user/user-123",
        {
          headers: {
            Authorization: "Bearer internal-service-token",
          },
        },
      );
      expect(tokenService.createInternalAccessToken).toHaveBeenCalledTimes(1);
      expect(response.json).toHaveBeenCalledTimes(1);
    });

    it("returns null for a 404 without trying to parse an error body", async () => {
      const response = makeResponse({ ok: false, status: 404 });
      fetchMock.mockResolvedValue(response);

      await expect(client.getAccountByUserId("missing-user")).resolves.toBeNull();

      expect(response.json).not.toHaveBeenCalled();
    });

    it("maps other unsuccessful account responses to AUTH-500", async () => {
      fetchMock.mockResolvedValue(makeResponse({ ok: false, status: 502 }));

      let thrown: unknown;
      try {
        await client.getAccountByUserId("user-123");
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(HttpException);
      expect((thrown as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect((thrown as HttpException).getResponse()).toEqual({
        errorCode: "AUTH-500",
        message: "Failed to look up trading account",
      });
    });

    it("propagates a network error from account lookup", async () => {
      const networkError = new Error("connection reset");
      fetchMock.mockRejectedValue(networkError);

      await expect(client.getAccountByUserId("user-123")).rejects.toBe(networkError);
    });
  });

  it("uses the default Trade API URL when the environment variable is absent", async () => {
    delete process.env.TRADE_API_URL;
    const defaultClient = new TradeApiClient(tokenService as unknown as TokenService);
    fetchMock.mockResolvedValue(
      makeResponse({ json: jest.fn().mockResolvedValue(null) }),
    );

    await defaultClient.getAccountByUserId("user-123");

    // The documented client contract supplies localhost when TRADE_API_URL is absent.
    // Keep this as a regression test until the production client honors that default.
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/internal/accounts/by-user/user-123",
      {
        headers: {
          Authorization: "Bearer internal-service-token",
        },
      },
    );
  });
});
