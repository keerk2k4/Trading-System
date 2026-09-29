import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TokenResponse {
  @ApiProperty()
  accessToken!: string;
  @ApiPropertyOptional()
  refreshToken?: string; // Only present in refresh endpoint
  @ApiProperty({ default: 'Bearer' })
  tokenType: string = "Bearer";
  @ApiProperty({ default: 900 })
  expiresIn: number = 900; // 15 minutes in seconds
}
