import { IsString, MaxLength } from "class-validator";

export class LoginRequest {
  @IsString()
  @MaxLength(64)
  username!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}
