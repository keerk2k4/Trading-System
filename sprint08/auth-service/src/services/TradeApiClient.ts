import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { TokenService } from "./TokenService";

export interface TradeAccountResponse {
  accountId: number;
  accountNumber: string;
  availableBalance: string;
  accountStatus: string;
}

@Injectable()
export class TradeApiClient {
  private readonly baseUrl = process.env.TRADE_API_URL || "http://localhost:8080";

  constructor(private tokenService: TokenService) {}

  // Internal API calls must use a separate service credential; customer JWTs are not appropriate here.
  async createAccount(userId: string): Promise<TradeAccountResponse> {
    const internalAccessToken = this.tokenService.createInternalAccessToken();
    const endpoint = `${this.baseUrl}/internal/accounts`;

    console.log("[TradeApiClient] Calling createAccount", {
      endpoint,
      userId,
      authScheme: "Bearer",
      tokenPrefix: internalAccessToken.slice(0, 16),
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalAccessToken}`,
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new HttpException(
        { errorCode: "AUTH-500", message: "Failed to create trading account" },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    return response.json() as Promise<TradeAccountResponse>;
  }

  async getAccountByUserId(userId: string): Promise<TradeAccountResponse | null> {
    const internalAccessToken = this.tokenService.createInternalAccessToken();
    const endpoint = `${this.baseUrl}/internal/accounts/by-user/${userId}`;

    console.log("[TradeApiClient] Calling getAccountByUserId", {
      endpoint,
      userId,
      authScheme: "Bearer",
      tokenPrefix: internalAccessToken,
    });

    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${internalAccessToken}`,
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new HttpException(
        { errorCode: "AUTH-500", message: "Failed to look up trading account" },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    return response.json() as Promise<TradeAccountResponse>;
  }

  async activateAccount(userId: string): Promise<TradeAccountResponse> {
    const internalAccessToken = this.tokenService.createInternalAccessToken();
    const endpoint = `${this.baseUrl}/internal/accounts/by-user/${userId}/activate`;

    console.log("[TradeApiClient] Calling activateAccount", {
      endpoint,
      userId,
      authScheme: "Bearer",
      tokenPrefix: internalAccessToken.slice(0, 16),
    });

    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${internalAccessToken}`,
      },
    });

    if (!response.ok) {
      throw new HttpException(
        { errorCode: "AUTH-500", message: "Failed to activate trading account" },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    return response.json() as Promise<TradeAccountResponse>;
  }
}