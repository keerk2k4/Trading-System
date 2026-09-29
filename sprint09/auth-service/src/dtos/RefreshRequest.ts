import { IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RefreshRequest {
  @ApiProperty({ description: 'The refresh token issued by the previous login or refresh' })
  @IsString()
  refreshToken!: string;
}
