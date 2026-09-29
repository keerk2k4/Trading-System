import { IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginRequest {
  @ApiProperty({ maxLength: 64, example: 'priya.menon' })
  @IsString()
  @MaxLength(64)
  username!: string;

  @ApiProperty({ maxLength: 128, example: 'correct horse battery staple' })
  @IsString()
  @MaxLength(128)
  password!: string;
}
