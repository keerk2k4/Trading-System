import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ForgotPasswordRequest {
  @ApiProperty({ maxLength: 64, example: 'priya.menon' })
  @IsString()
  @MaxLength(64)
  username!: string;
}

export class VerifyPasswordResetOtpRequest {
  @ApiProperty({ maxLength: 64, example: 'priya.menon' })
  @IsString()
  @MaxLength(64)
  username!: string;

  @ApiProperty({ pattern: '^\\d{6}$', example: '482913' })
  @Matches(/^\d{6}$/, { message: "otp must be a 6-digit code" })
  otp!: string;
}

export class ResetPasswordRequest {
  @ApiProperty({ maxLength: 64, example: 'priya.menon' })
  @IsString()
  @MaxLength(64)
  username!: string;

  @ApiProperty({ maxLength: 128, description: 'Token from POST /auth/forgot-password/verify.' })
  @IsString()
  @MaxLength(128)
  resetToken!: string;

  // Same rule as RegisterRequest.password.
  @ApiProperty({ minLength: 12, maxLength: 128, example: 'correct horse battery staple' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}

export class MessageResponse {
  @ApiProperty()
  message!: string;
}
