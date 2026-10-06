import { IsString, MinLength, MaxLength, Matches, IsOptional, IsArray, IsEnum, IsEmail } from "class-validator";
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

  // Used for notification emails (registration, KYC status). Stored
  // AES-256-GCM encrypted by UserRepository, never in plaintext.
  @ApiProperty({ maxLength: 254, example: 'priya.menon@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 80, example: 'Priya' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ minLength: 1, maxLength: 80, example: 'Menon' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  phone!: string;

  // Issued by POST /auth/register/otp/verify. Required by /auth/register
  // (enforced in the controller); /auth/admin/register shares this DTO and
  // ignores it.
  @ApiPropertyOptional({ maxLength: 128, description: 'Token from POST /auth/register/otp/verify.' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  emailVerificationToken?: string;

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