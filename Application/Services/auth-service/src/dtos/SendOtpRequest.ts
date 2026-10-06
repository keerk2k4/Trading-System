import { IsEmail, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SendOtpRequest {
  @ApiProperty({ maxLength: 254, example: 'priya.menon@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
