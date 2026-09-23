import { IsString, MinLength, MaxLength, Matches, IsOptional, IsArray, IsEnum } from "class-validator";

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

  // NOTE: accountId removed deliberately. The team decided registration
  // auto-creates a new trading account via Trade REST API, rather than
  // requiring the client to already own one -- see the security review
  // for the reasoning and the accepted tradeoff.

  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  roles?: Role[];
}