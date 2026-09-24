import { IsString, MinLength, MaxLength, Matches, IsOptional, IsArray, IsEnum } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum Role {
  CUSTOMER = "CUSTOMER",
  ADMIN = "ADMIN",
}

export class RegisterRequest {
  @ApiProperty({ minLength: 3, maxLength: 64, example: 'priya.menon' })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: "username must contain only alphanumeric characters, dots, dashes, and underscores",
  })
  username!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, example: 'correct horse battery staple' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  // NOTE: accountId removed deliberately. The team decided registration
  // auto-creates a new trading account via Trade REST API, rather than
  // requiring the client to already own one -- see the security review
  // for the reasoning and the accepted tradeoff.

  @ApiPropertyOptional({ enum: Role, isArray: true, example: ['CUSTOMER'] })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  roles?: Role[];
}