import { ApiProperty } from "@nestjs/swagger";

export class ErrorResponse {
  @ApiProperty({ enum: ['AUTH-401', 'AUTH-409', 'VAL-422', 'OTP-400', 'OTP-403', 'OTP-404', 'OTP-410', 'OTP-429', 'OTP-503'] })
  errorCode!: string; // AUTH-401, AUTH-409, VAL-422, OTP-*

  @ApiProperty()
  message!: string;
}
