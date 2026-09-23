export class TokenResponse {
  accessToken!: string;
  refreshToken?: string; // Only present in refresh endpoint
  tokenType: string = "Bearer";
  expiresIn: number = 900; // 15 minutes in seconds
}
