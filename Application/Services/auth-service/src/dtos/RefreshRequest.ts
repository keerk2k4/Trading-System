import { IsOptional, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RefreshRequest {
  // Optional: browsers send the refresh token in the HttpOnly refresh_token
  // cookie instead. Kept in the body for clients still in the transition.
  @ApiProperty({
    description: 'The refresh token issued by the previous login or refresh. Omit it when the refresh_token cookie is sent.',
    required: false,
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
