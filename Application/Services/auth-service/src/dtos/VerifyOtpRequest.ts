import { IsEmail, Matches, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class VerifyOtpRequest {
  @ApiProperty({ maxLength: 254, example: 'priya.menon@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ pattern: '^\\d{6}$', example: '482913' })
  @Matches(/^\d{6}$/, { message: "otp must be a 6-digit code" })
  otp!: string;
}
