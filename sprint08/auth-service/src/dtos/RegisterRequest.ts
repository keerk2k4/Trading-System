import { IsString, MinLength, MaxLength, IsInt, Matches, IsOptional, IsArray, IsEnum, Min } from "class-validator";

export enum Role {
  CUSTOMER = "CUSTOMER",
  ADMIN = "ADMIN",
}

export class RegisterRequest {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: "username must contain only alphanumeric characters, dots, dashes, and underscores",
  })
  username!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsInt()
  @Min(1)
  accountId!: number;

  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  roles?: Role[];
}
