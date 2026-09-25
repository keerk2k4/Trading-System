import { Injectable, HttpException, HttpStatus } from "@nestjs/common";

export interface TradeAccountResponse {
  accountId: number;
  accountNumber: string;
  availableBalance: string;
  accountStatus: string;
}

@Injectable()
export class TradeApiClient {
  private readonly baseUrl = process.env.TRADE_API_URL || "http://localhost:8080";

  // Internal API calls must use a separate service credential; customer JWTs are not appropriate here.
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