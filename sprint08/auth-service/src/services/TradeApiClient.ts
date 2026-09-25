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
  private readonly baseUrl = process.env.TRADE_API_URL;

  constructor(private tokenService: TokenService) {}

  // pass a token for auth service verificiation
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
      tokenPrefix: internalAccessToken.slice(0, 16),
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
}