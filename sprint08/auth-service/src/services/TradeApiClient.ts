import { Injectable, HttpException, HttpStatus } from "@nestjs/common";

export interface TradeAccountResponse {
  accountId: number;
  accountNumber: string;
  availableBalance: string;
  accountStatus: string;
}

/**
 * The only place in this service that talks to Trade REST API's internal
 * account endpoints. Every other part of the codebase goes through this
 * client, never building the HTTP call itself.
 */
@Injectable()
export class TradeApiClient {
  private readonly baseUrl = process.env.TRADE_API_URL || "http://localhost:8080";

  /**
   * Called once, during registration. Creates a brand new trading account
   * for this user, starting at balance 0 and status ACTIVE.
   */
  async createAccount(userId: string): Promise<TradeAccountResponse> {
    const response = await fetch(`${this.baseUrl}/internal/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  /**
   * Called on every login and refresh. Fetches the real, current account
   * for this user -- never cached, always read fresh from Trade API.
   */
  async getAccountByUserId(userId: string): Promise<TradeAccountResponse | null> {
    const response = await fetch(`${this.baseUrl}/internal/accounts/by-user/${userId}`);

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