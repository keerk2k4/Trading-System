import { ApiProperty } from "@nestjs/swagger";

export class SendOtpResponse {
  @ApiProperty({ example: 'A verification code has been sent to your email.' })
  message!: string;

  @ApiProperty({ description: 'Seconds until the code expires.', example: 600 })
  expiresIn!: number;

  @ApiProperty({ description: 'Seconds before another code can be requested.', example: 60 })
  resendAfter!: number;
}

export class VerifyOtpResponse {
  @ApiProperty({ description: 'Send as emailVerificationToken on POST /auth/register.' })
  verificationToken!: string;

  @ApiProperty({ description: 'Seconds the token stays valid.', example: 1800 })
  expiresIn!: number;
}
